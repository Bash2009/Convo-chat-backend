import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
  ApiHideProperty,
} from '@nestjs/swagger';

@ValidatorConstraint({ name: 'hasParticipant', async: false })
class HasParticipantConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments) {
    const dto = args.object as CreateChatDto;
    const hasMembers = Array.isArray(dto.members) && dto.members.length > 0;
    const hasAdmin = typeof dto.admin === 'string' && dto.admin.length > 0;
    return hasMembers || hasAdmin;
  }

  defaultMessage() {
    return 'At least one participant must be specified via members or admin';
  }
}

export class CreateChatDto {
  @ApiPropertyOptional({ description: 'Initial member UIDs' })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  members?: string[];

  @ApiPropertyOptional({ description: 'Chat name (required for groups)' })
  @IsString()
  @IsOptional()
  name: string;

  @ApiPropertyOptional({ description: 'Whether this is a group chat' })
  @IsBoolean()
  @IsOptional()
  isGroup: boolean;

  @ApiPropertyOptional({ description: 'Admin UID (defaults to creator)' })
  @IsString()
  @IsOptional()
  admin: string;

  @ApiHideProperty()
  @Validate(HasParticipantConstraint)
  private readonly _hasParticipant?: never;
}
