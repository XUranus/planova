import { useEffect, useRef, useCallback } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { useViewerStore } from '@/stores/viewerStore'
import * as THREE from 'three'

const WALK_SPEED = 1.5 // meters per second
const SPRINT_MULTIPLIER = 2.0
const SENSITIVITY = 0.002 // mouse sensitivity
const EYE_HEIGHT = 1.6 // meters

/**
 * First-person walk mode controls.
 * WASD to move, mouse to look, Shift to sprint, Space/Esc to exit.
 * Requires pointer lock on the canvas element.
 */
export function WalkControls() {
  const { camera, gl } = useThree()
  const setMode = useViewerStore((s) => s.setMode)

  const keysRef = useRef<Set<string>>(new Set())
  const yawRef = useRef(0)
  const pitchRef = useRef(0)
  const isLockedRef = useRef(false)

  // Initialize camera at eye height on mount
  useEffect(() => {
    camera.position.y = EYE_HEIGHT
    // Extract current yaw from camera rotation
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
    yawRef.current = euler.y
    pitchRef.current = euler.x
  }, [camera])

  // Pointer lock handling
  const requestLock = useCallback(() => {
    if (!isLockedRef.current) {
      gl.domElement.requestPointerLock()
    }
  }, [gl])

  useEffect(() => {
    const canvas = gl.domElement

    const onPointerLockChange = () => {
      isLockedRef.current = document.pointerLockElement === canvas
      if (!isLockedRef.current) {
        // Lock released — exit walk mode
        setMode('orbit')
      }
    }

    const onPointerLockError = () => {
      console.warn('Pointer lock failed')
      setMode('orbit')
    }

    document.addEventListener('pointerlockchange', onPointerLockChange)
    document.addEventListener('pointerlockerror', onPointerLockError)

    // Request lock on click
    canvas.addEventListener('click', requestLock)
    requestLock()

    return () => {
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      document.removeEventListener('pointerlockerror', onPointerLockError)
      canvas.removeEventListener('click', requestLock)
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock()
      }
    }
  }, [gl, setMode, requestLock])

  // Keyboard input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.code)

      if (e.code === 'Space' || e.code === 'Escape') {
        e.preventDefault()
        setMode('orbit')
        if (document.pointerLockElement) {
          document.exitPointerLock()
        }
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [setMode])

  // Mouse look
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isLockedRef.current) return

      yawRef.current -= e.movementX * SENSITIVITY
      pitchRef.current -= e.movementY * SENSITIVITY

      // Clamp pitch to prevent flipping
      pitchRef.current = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, pitchRef.current)
      )
    }

    document.addEventListener('mousemove', onMouseMove)
    return () => document.removeEventListener('mousemove', onMouseMove)
  }, [])

  // Movement update each frame
  useFrame((_, delta) => {
    const keys = keysRef.current
    const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight'))
      ? WALK_SPEED * SPRINT_MULTIPLIER
      : WALK_SPEED

    const moveDistance = speed * delta

    // Forward direction in XZ plane (based on yaw only)
    const forwardX = -Math.sin(yawRef.current)
    const forwardZ = -Math.cos(yawRef.current)
    const rightX = Math.cos(yawRef.current)
    const rightZ = -Math.sin(yawRef.current)

    let dx = 0
    let dz = 0

    if (keys.has('KeyW')) { dx += forwardX * moveDistance; dz += forwardZ * moveDistance }
    if (keys.has('KeyS')) { dx -= forwardX * moveDistance; dz -= forwardZ * moveDistance }
    if (keys.has('KeyA')) { dx -= rightX * moveDistance; dz -= rightZ * moveDistance }
    if (keys.has('KeyD')) { dx += rightX * moveDistance; dz += rightZ * moveDistance }

    camera.position.x += dx
    camera.position.z += dz
    camera.position.y = EYE_HEIGHT

    // Apply rotation (YXZ order: yaw first, then pitch)
    camera.rotation.order = 'YXZ'
    camera.rotation.y = yawRef.current
    camera.rotation.x = pitchRef.current
  })

  return null
}
