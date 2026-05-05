import * as THREE from 'three'
import type { BuiltObject } from '@/engine/buildObjects'
import type { HomeSceneJSON } from '@/types/scene'

/**
 * Disposes all geometries and materials in a THREE.Group.
 */
function disposeMeshGroup(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose())
      } else {
        child.material.dispose()
      }
    }
  })
}

/**
 * Deletes a built object: removes from scene graph, disposes resources,
 * and returns updated homeScene + builtObjects arrays.
 */
export function deleteObject(
  objectId: string,
  homeScene: HomeSceneJSON,
  builtObjects: BuiltObject[],
): { homeScene: HomeSceneJSON; builtObjects: BuiltObject[] } {
  const builtObj = builtObjects.find((o) => o.id === objectId)
  if (builtObj) {
    builtObj.mesh.parent?.remove(builtObj.mesh)
    disposeMeshGroup(builtObj.mesh)
  }

  return {
    homeScene: { ...homeScene, objects: homeScene.objects.filter((o) => o.id !== objectId) },
    builtObjects: builtObjects.filter((o) => o.id !== objectId),
  }
}
