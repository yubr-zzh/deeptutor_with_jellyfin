# Avatar Resources

This directory contains 3D avatar models and textures for the Avatar Chat feature.

## Directory Structure

```
avatars/
├── README.md
├── student-avatar.png        # Default avatar thumbnail
├── glb/
│   └── README.md            # 3D model files
└── textures/
    └── README.md            # Texture files
```

## Features

- 3D GLTF/GLB model support
- Morph targets for facial expressions
- Skeletal animations
- Lip sync (viseme-based)

## Usage

Import Avatar components:
```tsx
import { AvatarChat } from '@/components/avatar';

<AvatarChat
  avatarUrl="/avatars/glb/student-avatar.glb"
  currentMessage="Hello!"
  speaking={true}
/>
```
