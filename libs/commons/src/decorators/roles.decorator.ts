import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/guard/role.enum';

const Role_key = 'roles';

export const Roles = (...roles: Role[]) => SetMetadata(Role_key, roles);
