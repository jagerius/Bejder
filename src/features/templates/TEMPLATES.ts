typescript
export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  preview: string;
}

export const TEMPLATES: TemplateDefinition[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Klasyczny układ ornamentu z równomiernym rozkładem segmentów.',
    preview: 'classic',
  },
  {
    id: 'spiral',
    name: 'Spiral',
    description: 'Układ inspirowany spiralą, dobry do płynnych przejść kolorów.',
    preview: 'spiral',
  },
  {
    id: 'bands',
    name: 'Bands',
    description: 'Szablon pasów poziomych, ułatwia budowanie rytmicznych wzorów.',
    preview: 'bands',
  },
];