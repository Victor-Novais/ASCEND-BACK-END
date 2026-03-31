export class TemplateCatalogItemDto {
  id!: number;
  name!: string;
  description!: string | null;
  isActive!: boolean;
  questionCount!: number;
  categories!: string[];
}

export class TemplateCatalogResponseDto {
  items!: TemplateCatalogItemDto[];
  count!: number;
}

