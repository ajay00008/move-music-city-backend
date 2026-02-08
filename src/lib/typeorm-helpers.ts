import { FindOptionsWhere, FindManyOptions, IsNull, Not } from 'typeorm';

// Helper to build where clause with soft delete check
export const withSoftDelete = <T>(where: FindOptionsWhere<T> = {}): FindOptionsWhere<T> => {
  return {
    ...where,
    deletedAt: IsNull(),
  } as FindOptionsWhere<T>;
};

// Helper for pagination
export const paginateOptions = (page: number = 1, limit: number = 10) => {
  return {
    skip: (page - 1) * limit,
    take: limit,
  };
};
