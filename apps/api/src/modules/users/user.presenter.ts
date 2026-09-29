import type { UserDto } from "@nexora/contracts";
import type { User } from "@prisma/client";

export function presentUser(user: User): UserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    jobTitle: user.jobTitle,
    status: user.status as UserDto["status"],
    isSuperAdmin: user.isSuperAdmin,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}
