import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateChatDto {
  @IsArray()
  members: string[];

  @IsString()
  @IsOptional()
  name: string;

  @IsOptional()
  isGroup: boolean;

  @IsString()
  @IsOptional()
  admin: string;
}
