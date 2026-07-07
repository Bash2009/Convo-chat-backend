import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateChatDto {
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  members?: string[];

  @IsString()
  @IsOptional()
  name: string;

  @IsOptional()
  isGroup: boolean;

  @IsString()
  @IsOptional()
  admin: string;
}
