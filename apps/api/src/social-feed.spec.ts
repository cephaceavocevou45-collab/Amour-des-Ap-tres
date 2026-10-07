import { SocialFeedService } from './social-feed';
import { PrismaService } from './prisma.service';
import { UserRole, SocialVisibility } from '@prisma/client';

describe('social feed access and publication rules',()=>{
  it('refuses non-faithful roles before querying or creating social content',async()=>{
    const prisma={socialPost:{upsert:jest.fn()}} as unknown as PrismaService;
    const service=new SocialFeedService(prisma);
    await expect(service.feed({sub:'editor-id',role:UserRole.EDITEUR})).rejects.toMatchObject({status:403});
    await expect(service.createPost({sub:'editor-id',role:UserRole.EDITEUR},{body:'Test',visibility:SocialVisibility.TOUS_LES_FIDELES},'retry_01')).rejects.toMatchObject({status:403});
    expect((prisma as any).socialPost.upsert).not.toHaveBeenCalled();
  });

  it('does not expose a private post to another faithful account',async()=>{
    const prisma={socialPost:{findUnique:jest.fn().mockResolvedValue({id:'private-post',authorId:'author-id',body:'Secret',visibility:SocialVisibility.MOI_SEUL,deletedAt:null,author:{id:'author-id',role:UserRole.FIDELE},hiddenBy:[]})}} as unknown as PrismaService;
    const service=new SocialFeedService(prisma);
    await expect((service as any).visiblePost('private-post','visitor-id')).rejects.toMatchObject({status:404});
  });

  it('returns the existing resource for a repeated idempotency key without creating another row',async()=>{
    const existing={id:'post-1',authorId:'faithful-id',body:'Journée paisible',visibility:SocialVisibility.TOUS_LES_FIDELES,pinned:false,createdAt:new Date(),updatedAt:new Date(),author:{id:'faithful-id',fullName:'Compte adulte',dateOfBirth:new Date('1990-01-01')},_count:{comments:0}};
    const prisma={socialPost:{findUnique:jest.fn().mockResolvedValue(existing),upsert:jest.fn()},socialReaction:{groupBy:jest.fn().mockResolvedValue([]),findFirst:jest.fn().mockResolvedValue(null)}} as unknown as PrismaService;
    const result=await new SocialFeedService(prisma).createPost({sub:'faithful-id',role:UserRole.FIDELE},{body:'Journée paisible',visibility:SocialVisibility.TOUS_LES_FIDELES},'retry_01');
    expect(result.id).toBe(existing.id);
    expect((prisma as any).socialPost.upsert).not.toHaveBeenCalled();
  });

  it('does not reveal the name of a minor through a public post',async()=>{
    const dateOfBirth=new Date();dateOfBirth.setUTCFullYear(dateOfBirth.getUTCFullYear()-16);
    const prisma={socialPost:{findUnique:jest.fn()},socialReaction:{groupBy:jest.fn().mockResolvedValue([]),findFirst:jest.fn().mockResolvedValue(null)}} as unknown as PrismaService;
    const service=new SocialFeedService(prisma);
    const output=await (service as any).shape({id:'p1',body:'Bonjour',visibility:SocialVisibility.TOUS_LES_FIDELES,pinned:false,createdAt:new Date(),updatedAt:new Date(),author:{id:'minor-id',fullName:'Identité privée',dateOfBirth},_count:{comments:0}},'reader-id');
    expect(output.author.displayName).toBe('Membre fidèle');
    expect(JSON.stringify(output)).not.toContain('Identité privée');
    expect(JSON.stringify(output)).not.toContain(dateOfBirth.toISOString());
  });
});
