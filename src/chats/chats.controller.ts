import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ChatsService } from './chats.service';
import { AddMembersDto } from './dto/add-members.dto';
import { CreateChatDto } from './dto/create-chat.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { Request } from 'express';

@UseGuards(JwtAuthGuard)
@Controller('chats')
export class ChatsController {
  constructor(private chatService: ChatsService) {}

  @Post()
  create(@Body() createChatDto: CreateChatDto) {
    return this.chatService.create(createChatDto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: Request) {
    const user = req['user'] as { userId: string };
    return this.chatService.delete(id, user.userId);
  }

  @Patch(':id/members')
  async addMembers(
    @Param('id') id: string,
    @Body() dto: AddMembersDto,
    @Req() req: Request,
  ) {
    const user = req['user'] as { userId: string };
    return this.chatService.addMembers(id, dto.members, user.userId);
  }
}
