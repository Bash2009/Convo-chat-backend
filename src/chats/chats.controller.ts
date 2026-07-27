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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ChatsService } from './chats.service';
import { AddMembersDto } from './dto/add-members.dto';
import { CreateChatDto } from './dto/create-chat.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { Request } from 'express';

@ApiTags('Chats')
@UseGuards(JwtAuthGuard)
@Controller()
export class ChatsController {
  constructor(private chatService: ChatsService) {}

  @Post('create')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a chat' })
  @ApiResponse({ status: 201, description: 'Chat created' })
  create(@Body() createChatDto: CreateChatDto, @Req() req: Request) {
    const uid = (req['user'] as { userId: string }).userId;
    const currentMembers = createChatDto.members ?? [];
    const members = currentMembers.includes(uid)
      ? currentMembers
      : [...currentMembers, uid];
    return this.chatService.create({
      ...createChatDto,
      members,
      admin: uid,
    });
  }

  @Delete('chats/:id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a chat' })
  @ApiResponse({ status: 200, description: 'Chat deleted' })
  async delete(@Param('id') id: string, @Req() req: Request) {
    const uid = req['user'] as { userId: string };
    return this.chatService.delete(id, uid.userId);
  }

  @Patch('chats/:id/members')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Add members to group chat' })
  @ApiResponse({ status: 200, description: 'Members added' })
  async addMembers(
    @Param('id') id: string,
    @Body() dto: AddMembersDto,
    @Req() req: Request,
  ) {
    const uid = req['user'] as { userId: string };
    return this.chatService.addMembers(id, dto.members, uid.userId);
  }
}
