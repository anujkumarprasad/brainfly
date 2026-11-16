import type { Novel } from '@bl/shared';
import { tortoiseAndHareNovel } from './tortoise_and_hare';

export { tortoiseAndHareNovel };

export const NOVELS_REGISTRY: Record<string, Novel> = {
  'the-great-woodland-race': tortoiseAndHareNovel,
};

export const DEFAULT_NOVEL_ID = 'the-great-woodland-race';
