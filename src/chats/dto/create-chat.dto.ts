import { IsArray, IsOptional, IsString, ArrayNotEmpty } from 'class-validator';

export class CreateChatDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
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
