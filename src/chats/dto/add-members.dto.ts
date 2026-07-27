import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddMembersDto {
  @ApiProperty({ description: 'UIDs of users to add' })
  @IsArray()
  @IsString({ each: true })
  members: string[];
}
