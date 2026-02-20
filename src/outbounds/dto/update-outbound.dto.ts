import { PartialType } from '@nestjs/mapped-types';
import { CreateOutboundDto } from './create-outbound.dto';

export class UpdateOutboundDto extends PartialType(CreateOutboundDto) {
  id: number;
}
