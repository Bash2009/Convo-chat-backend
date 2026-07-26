import { Test, TestingModule } from '@nestjs/testing';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';

describe('ChatsController', () => {
  let controller: ChatsController;
  let service: jest.Mocked<ChatsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatsController],
      providers: [
        {
          provide: ChatsService,
          useValue: {
            create: jest.fn(),
            delete: jest.fn(),
            addMembers: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(ChatsController);
    service = module.get(ChatsService);
  });

  describe('create', () => {
    it('delegates to service.create with caller uid forced in', async () => {
      const dto = { members: ['uid2'], admin: 'uid1' };
      const req = { user: { userId: 'uid1' } } as any;
      service.create.mockResolvedValue({ id: 'chat-id' } as any);

      const result = await controller.create(dto as any, req);

      expect(result.id).toBe('chat-id');
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({ members: expect.arrayContaining(['uid1', 'uid2']) }),
      );
    });
  });

  describe('delete', () => {
    it('delegates to service.delete', async () => {
      const req = { user: { userId: 'uid1' } } as any;
      service.delete.mockResolvedValue({ id: 'chat-id', deleted: true, participantUids: ['uid1'] } as any);

      const result = await controller.delete('chat-id', req);

      expect(result.deleted).toBe(true);
      expect(service.delete).toHaveBeenCalledWith('chat-id', 'uid1');
    });
  });

  describe('addMembers', () => {
    it('delegates to service.addMembers', async () => {
      const req = { user: { userId: 'uid1' } } as any;
      const body = { members: ['uid3'] };
      service.addMembers.mockResolvedValue({ id: 'chat-id' } as any);

      const result = await controller.addMembers('chat-id', body, req);

      expect(result.id).toBe('chat-id');
      expect(service.addMembers).toHaveBeenCalledWith(
        'chat-id',
        ['uid3'],
        'uid1',
      );
    });
  });
});
