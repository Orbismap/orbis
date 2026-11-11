# render/gl

Reserved for the WebGL2 field renderer (`fieldLayer`, `gl/field.ts`) and the wind particles (`particleLayer`,
`gl/particles.ts`), see `docs/ARCHITECTURE.md`. They are built by a separate agent and loaded with `import()`
from the weather layers. Nothing lives here yet.

Contract for custom layers (`MapEngine.addCustomLayer`): MapLibre calls `onRemove` when the layer is removed and
`onAdd` again if the same instance is added again, so all GL state must be (re)created in `onAdd`.
