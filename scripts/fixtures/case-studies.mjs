// Synthetic test data, never imported into the public site.
export function snapshotFixture() {
  return {
    schemaVersion: 1,
    cases: [{ id: 'synthetic-one', slug: 'synthetic-one', status: 'published', content: {
      title: 'Synthetic test — not client work', summary: 'Fixture for local checks only.',
      context: 'First paragraph.\nSecond paragraph.', work: 'Rendering and navigation test.',
      cover: { assetId: 'test-pixel', alt: 'Synthetic test pixel' }, gallery: [],
    } }],
    media: [{ id: 'test-pixel', mime: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNg+M8AAAICAQAuFKzOAAAAAElFTkSuQmCC' }],
  };
}
