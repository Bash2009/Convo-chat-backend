import {
  IsArray,
  IsOptional,
  IsString,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

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

  @Validate(HasParticipantConstraint)
  private readonly _hasParticipant?: never;
}
