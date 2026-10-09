import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommunityMessagingService } from './community-messaging';
import { PrismaService } from './prisma.service';

describe('CommunityMessagingService access boundaries',()=>{
  const prisma:any={
    communityConversationMember:{findFirst:jest.fn()},
    communityMessage:{findMany:jest.fn(),findFirst:jest.fn(),upsert:jest.fn()},
    communityConversation:{findMany:jest.fn(),findFirst:jest.fn(),update:jest.fn()},
    communityMessageReaction:{upsert:jest.fn(),deleteMany:jest.fn()},
    communityMessageReport:{create:jest.fn()},
    user:{findFirst:jest.fn()},
    socialBlock:{findFirst:jest.fn()},
    auditLog:{create:jest.fn()},
    $transaction:jest.fn(async(callback:any)=>callback(prisma)),
  };
  let service:CommunityMessagingService;
  beforeEach(()=>{jest.clearAllMocks();service=new CommunityMessagingService(prisma as PrismaService);});

  it('refuses roles outside the parish member set',async()=>{
    await expect(service.list({sub:'user-a',role:'EDITEUR'})).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.communityConversation.findMany).not.toHaveBeenCalled();
  });

  it('hides a conversation identifier from accounts that are not active members',async()=>{
    prisma.communityConversationMember.findFirst.mockResolvedValue(null);
    await expect(service.messages({sub:'user-b',role:'FIDELE'},'conversation-a')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.communityMessage.findMany).not.toHaveBeenCalled();
  });

  it('checks membership before attempting to write a message',async()=>{
    prisma.communityConversationMember.findFirst.mockResolvedValue(null);
    await expect(service.send({sub:'user-b',role:'FIDELE'},'conversation-a',{body:'Bonjour',idempotencyKey:'request-key-123'})).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.communityMessage.upsert).not.toHaveBeenCalled();
  });

  it('checks membership before recording a reaction or report',async()=>{
    prisma.communityMessage.findFirst.mockResolvedValue(null);
    await expect(service.reaction({sub:'user-b',role:'FIDELE'},'message-a',{emoji:'🙏'})).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.report({sub:'user-b',role:'FIDELE'},'message-a',{reason:'SPAM'})).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.communityMessageReaction.upsert).not.toHaveBeenCalled();
    expect(prisma.communityMessageReport.create).not.toHaveBeenCalled();
  });
});
