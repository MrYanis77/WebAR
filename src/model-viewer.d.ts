// Fichier module (import ci-dessous) : complète les types de React sans les remplacer.
import type { ModelViewerElement } from '@google/model-viewer'
import 'react'

// Composant web <model-viewer> (Google) utilisé dans les vues React : attributs HTML en kebab-case.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        ref?: React.Ref<ModelViewerElement>
        src?: string
        alt?: string
        ar?: boolean
        'ar-modes'?: string
        'ar-placement'?: 'floor' | 'wall'
        'ar-scale'?: 'auto' | 'fixed'
        'camera-controls'?: boolean
        'disable-zoom'?: boolean
        'touch-action'?: string
        'auto-rotate'?: boolean
        'shadow-intensity'?: string
        exposure?: string
        'interaction-prompt'?: string
        loading?: 'auto' | 'lazy' | 'eager'
      }
    }
  }
}
