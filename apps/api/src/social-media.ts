import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, HttpException, Injectable, Param, Post, Req, Res, ServiceUnavailableException, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SocialVisibility, UserRole } from '@prisma/client';
import { createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
const sharp = require('sharp') as (input: Buffer, options?: Record<string, unknown>) => any;
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth.guard';

const MEMBER_ROLES: UserRole[] = [UserRole.FIDELE, UserRole.SECRETAIRE_PRESENCE, UserRole.RESPONSABLE_SEMAINE];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_MEDIA_PER_POST = 4;
const MEDIA_LIMIT_PER_HOUR = 12;

class MediaPostDto {
  @IsOptional() @IsString() @MaxLength(5000) body?: string;
  @IsOptional() @IsEnum(SocialVisibility) visibility?: SocialVisibility;
}
type UploadedImage = { buffer: Buffer; size: number };
type StoredImage = { objectKey: string; mimeType: string; width: number; height: number; byteSize: number };

@Injectable()
export class SocialMediaService {
  private s3Client?: S3Client;
  private readonly uploadTimes = new Map<string, number[]>();
  constructor(private readonly prisma: PrismaService) {}

  enabled() {
    const endpoint = process.env.MEDIA_S3_ENDPOINT?.trim();
    const scanner = process.env.CLAMAV_HOST?.trim();
    const required = [process.env.MEDIA_S3_BUCKET, process.env.MEDIA_S3_REGION, process.env.MEDIA_S3_ACCESS_KEY, process.env.MEDIA_S3_SECRET_KEY];
    if ((process.env.SOCIAL_MEDIA_ENABLED !== 'true' && process.env.SOCIAL_PHOTOS_ENABLED !== 'true') || !endpoint || !scanner || required.some(value => !value?.trim())) return false;
    try { const url = new URL(endpoint); return url.protocol === 'https:' || ['localhost', '127.0.0.1', '::1'].includes(url.hostname); } catch { return false; }
  }

  memberConfig(user: { sub: string; role: string }) { this.requireMember(user); }

  private requireMember(user: { sub: string; role: string }) {
    if (!MEMBER_ROLES.includes(user.role as UserRole)) throw new ForbiddenException('Cette action est réservée aux membres de la communauté.');
    return user.sub;
  }

  private ensureConfigured() {
    if (!this.enabled()) throw new ServiceUnavailableException('Le partage de fichiers est momentanément indisponible.');
  }

  private client() {
    this.ensureConfigured();
    if (!this.s3Client) this.s3Client = new S3Client({
      region: process.env.MEDIA_S3_REGION!,
      endpoint: process.env.MEDIA_S3_ENDPOINT,
      forcePathStyle: process.env.MEDIA_S3_FORCE_PATH_STYLE !== 'false',
      credentials: { accessKeyId: process.env.MEDIA_S3_ACCESS_KEY!, secretAccessKey: process.env.MEDIA_S3_SECRET_KEY! },
    });
    return this.s3Client;
  }

  private bucket() { return process.env.MEDIA_S3_BUCKET!; }

  private detectImage(buffer: Buffer) {
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return null;
  }

  private detectAttachment(buffer: Buffer): 'application/pdf' | 'video/mp4' | 'video/webm' | null {
    if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
    if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4';
    if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'video/webm';
    return null;
  }

  private async normalizeMedia(file: UploadedImage): Promise<StoredImage> {
    if (!file?.buffer?.length) throw new BadRequestException('Le fichier est vide ou illisible.');
    if (this.detectImage(file.buffer)) return this.normalizeImage(file);
    if (file.buffer.length > MAX_FILE_BYTES) throw new BadRequestException('Chaque fichier doit peser 10 Mo au maximum.');
    const mimeType = this.detectAttachment(file.buffer);
    if (!mimeType) throw new BadRequestException('Formats acceptés : images JPEG, PNG ou WebP, vidéos MP4 ou WebM, et documents PDF.');
    await this.scan(file.buffer);
    const extension = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'video/webm' ? 'webm' : 'mp4';
    const objectKey = `community/${randomUUID()}.${extension}`;
    try {
      await this.client().send(new PutObjectCommand({ Bucket: this.bucket(), Key: objectKey, Body: file.buffer, ContentType: mimeType, CacheControl: 'private, max-age=300', ServerSideEncryption: 'AES256' }));
    } catch {
      throw new ServiceUnavailableException('Le stockage privé des fichiers est momentanément indisponible.');
    }
    return { objectKey, mimeType, width: 0, height: 0, byteSize: file.buffer.length };
  }

  async scan(buffer: Buffer) {
    const host = process.env.CLAMAV_HOST?.trim();
    if (!host) throw new ServiceUnavailableException('L’analyse de sécurité des fichiers n’est pas configurée.');
    const port = Number(process.env.CLAMAV_PORT ?? 3310);
    return new Promise<void>((resolve, reject) => {
      const socket = createConnection({ host, port });
      const chunks: Buffer[] = [];
      let settled = false;
      const fail = (error: Error) => { if (settled) return; settled = true; socket.destroy(); reject(error); };
      socket.setTimeout(15_000, () => fail(new ServiceUnavailableException('Le contrôle antivirus a dépassé son délai.')));
      socket.on('error', () => fail(new ServiceUnavailableException('Le contrôle antivirus est indisponible.')));
      socket.on('data', (data: Buffer) => {
        chunks.push(data);
        const response = Buffer.concat(chunks).toString('utf8');
        if (!response.includes('\0')) return;
        if (settled) return;
        settled = true;
        socket.end();
        if (/FOUND\0?$/.test(response.trim())) reject(new HttpException('Cette image ne peut pas être envoyée.', 422));
        else if (/OK\0?$/.test(response.trim())) resolve();
        else reject(new ServiceUnavailableException('Le contrôle antivirus n’a pas pu vérifier le fichier.'));
      });
      socket.once('connect', () => {
        socket.write(Buffer.from('zINSTREAM\0'));
        for (let offset = 0; offset < buffer.length; offset += 64 * 1024) {
          const part = buffer.subarray(offset, Math.min(offset + 64 * 1024, buffer.length));
          const length = Buffer.alloc(4); length.writeUInt32BE(part.length);
          socket.write(length); socket.write(part);
        }
        socket.write(Buffer.alloc(4));
      });
    });
  }

  private async normalizeImage(file: UploadedImage): Promise<StoredImage> {
    if (!file?.buffer?.length || file.buffer.length > MAX_FILE_BYTES) throw new BadRequestException('Chaque image doit peser 10 Mo au maximum.');
    if (!this.detectImage(file.buffer)) throw new BadRequestException('Seules les images JPEG, PNG et WebP sont acceptées.');
    await this.scan(file.buffer);
    try {
      const image = sharp(file.buffer, { limitInputPixels: 40_000_000, animated: false, failOn: 'error' });
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height || metadata.pages && metadata.pages > 1) throw new BadRequestException('Cette image n’est pas prise en charge.');
      const result = await image.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });
      const objectKey = `community/${randomUUID()}.webp`;
      try {
        await this.client().send(new PutObjectCommand({ Bucket: this.bucket(), Key: objectKey, Body: result.data, ContentType: 'image/webp', CacheControl: 'private, max-age=300', ServerSideEncryption: 'AES256' }));
      } catch {
        throw new ServiceUnavailableException('Le stockage des images est momentanément indisponible.');
      }
      return { objectKey, mimeType: 'image/webp', width: result.info.width, height: result.info.height, byteSize: result.data.length };
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException || error instanceof HttpException) throw error;
      throw new BadRequestException('Le fichier image est endommagé ou n’a pas pu être traité.');
    }
  }

  private async deleteObjects(keys: string[]) {
    await Promise.allSettled(keys.map(Key => this.client().send(new DeleteObjectCommand({ Bucket: this.bucket(), Key }))));
  }

  private async safeMemberName(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, dateOfBirth: true } });
    if (!user?.dateOfBirth) return 'Membre fidèle';
    let age = new Date().getUTCFullYear() - user.dateOfBirth.getUTCFullYear();
    if (new Date().getUTCMonth() < user.dateOfBirth.getUTCMonth() || new Date().getUTCMonth() === user.dateOfBirth.getUTCMonth() && new Date().getUTCDate() < user.dateOfBirth.getUTCDate()) age--;
    return age < 18 ? 'Membre fidèle' : user.fullName ?? 'Membre fidèle';
  }

  async createPost(user: { sub: string; role: string }, dto: MediaPostDto, files: UploadedImage[], idempotencyKey?: string) {
    const userId = this.requireMember(user);
    this.ensureConfigured();
    const account=await this.prisma.user.findUnique({where:{id:userId},select:{createdAt:true}});
    if(account&&Date.now()-account.createdAt.getTime()<24*60*60_000)throw new HttpException('Le partage de fichiers est disponible après 24 heures d’ancienneté du compte.',403);
    if (!Array.isArray(files) || files.length < 1 || files.length > MAX_MEDIA_PER_POST) throw new BadRequestException('Ajoutez de 1 à 4 fichiers à votre publication.');
    const body = dto.body?.trim() ?? '';
    if (body.length > 5000) throw new BadRequestException('Le texte est limité à 5 000 caractères.');
    const key = (idempotencyKey ?? '').trim();
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(key)) throw new BadRequestException('Un identifiant de publication valide est requis.');
    const now = Date.now(), recent = (this.uploadTimes.get(userId) ?? []).filter(time => now - time < 60 * 60_000);
    if (recent.length >= MEDIA_LIMIT_PER_HOUR) throw new HttpException('La limite d’envoi d’images est atteinte. Réessayez plus tard.', 429);
    const existing = await this.prisma.socialPost.findUnique({ where: { authorId_idempotencyKey: { authorId: userId, idempotencyKey: key } }, include: { media: { orderBy: { position: 'asc' } } } });
    if (existing) return { id: existing.id, body: existing.body, visibility: existing.visibility, createdAt: existing.createdAt, author: { id: userId, displayName: await this.safeMemberName(userId) }, commentCount: 0, likes: 0, hearts: 0, likedByMe: false, heartedByMe: false, pinned: existing.pinned, sharedPost: null, media: existing.media.map(({ id, mimeType, width, height, byteSize, position }) => ({ id, mimeType, width, height, byteSize, position })) };
    if (!body && files.length === 0) throw new BadRequestException('Ajoutez un texte ou une image.');
    recent.push(now); this.uploadTimes.set(userId, recent);
    const objects: StoredImage[] = [];
    try {
      for (const file of files) objects.push(await this.normalizeMedia(file));
      const post = await this.prisma.socialPost.create({
        data: { authorId: userId, idempotencyKey: key, body, visibility: dto.visibility ?? SocialVisibility.TOUS_LES_FIDELES, media: { create: objects.map((image, position) => ({ uploadedById: userId, objectKey: image.objectKey, mimeType: image.mimeType, byteSize: image.byteSize, width: image.width, height: image.height, position })) } },
        include: { author: { select: { id: true, fullName: true, dateOfBirth: true } }, media: { orderBy: { position: 'asc' } }, _count: { select: { comments: true } } },
      });
      return { id: post.id, body: post.body, visibility: post.visibility, pinned: post.pinned, createdAt: post.createdAt, author: { id: post.author.id, displayName: await this.safeMemberName(userId) }, sharedPost: null, commentCount: post._count.comments, likes: 0, hearts: 0, likedByMe: false, heartedByMe: false, media: post.media.map(({ id, mimeType, width, height, byteSize, position }) => ({ id, mimeType, width, height, byteSize, position })) };
    } catch (error) {
      await this.deleteObjects(objects.map(item => item.objectKey));
      throw error;
    }
  }

  async image(user: { sub: string; role: string }, id: string) {
    const userId = this.requireMember(user);
    this.ensureConfigured();
    const media = await this.prisma.socialPostMedia.findUnique({ where: { id }, include: { post: { include: { author: { select: { id: true, role: true, active: true, suspendedAt: true, moderationProfileHidden:true, moderationProfileHiddenUntil:true } }, hiddenBy: { where: { userId }, select: { id: true } } } } } });
    const now=new Date();
    if (!media || media.post.deletedAt || media.post.moderationHidden&&(!media.post.moderationHiddenUntil||media.post.moderationHiddenUntil>now) || media.post.author.moderationProfileHidden&&(!media.post.author.moderationProfileHiddenUntil||media.post.author.moderationProfileHiddenUntil>now) || !media.post.author.active || media.post.author.suspendedAt || !MEMBER_ROLES.includes(media.post.author.role) || media.post.visibility === SocialVisibility.MOI_SEUL && media.post.authorId !== userId || media.post.hiddenBy.length) throw new HttpException('Image introuvable.', 404);
    const block = await this.prisma.socialBlock.findFirst({ where: { OR: [{ blockerId: userId, blockedId: media.post.authorId }, { blockerId: media.post.authorId, blockedId: userId }] }, select: { id: true } });
    if (block) throw new HttpException('Image introuvable.', 404);
    let object;
    try { object = await this.client().send(new GetObjectCommand({ Bucket: this.bucket(), Key: media.objectKey })); }
    catch { throw new ServiceUnavailableException('Le stockage des images est momentanément indisponible.'); }
    if (!object.Body) throw new HttpException('Image introuvable.', 404);
    return { buffer: Buffer.from(await object.Body.transformToByteArray()), mimeType: media.mimeType };
  }
}

@Controller('social')
@UseGuards(JwtAuthGuard)
export class SocialMediaController {
  constructor(private readonly media: SocialMediaService) {}

  @Post('posts/media')
  @UseInterceptors(AnyFilesInterceptor({ limits: { files: MAX_MEDIA_PER_POST, fileSize: MAX_FILE_BYTES, fields: 4, parts: 8 } }))
  create(@Req() req: any, @Body() body: MediaPostDto, @UploadedFiles() files: UploadedImage[], @Headers('idempotency-key') key?: string) {
    return this.media.createPost(req.user, body, files, key);
  }

  @Get('media/config')
  config(@Req() req: any) { this.media.memberConfig(req.user); return { enabled: this.media.enabled(), maximumFiles: MAX_MEDIA_PER_POST, maximumBytesPerFile: MAX_FILE_BYTES }; }

  @Get('media/:id')
  async read(@Req() req: any, @Param('id') id: string, @Res() response: any) {
    const media = await this.media.image(req.user, id);
    response.setHeader('Content-Type', media.mimeType);
    response.setHeader('Content-Length', media.buffer.length);
    response.setHeader('Content-Disposition', media.mimeType === 'application/pdf' ? 'attachment; filename="document-paroissial.pdf"' : 'inline; filename="media-paroissial"');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    response.status(200).send(media.buffer);
  }
}
