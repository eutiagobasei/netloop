'use client'

import { useEffect, useRef, useCallback } from 'react'

interface Marker {
  lat: number
  lng: number
  label?: string
}

interface Connection {
  from: { lat: number; lng: number }
  to: { lat: number; lng: number }
}

interface InteractiveGlobeProps {
  size?: number
  dotColor?: string
  arcColor?: string
  markerColor?: string
  autoRotateSpeed?: number
  connections?: Connection[]
  markers?: Marker[]
  className?: string
}

// Convert lat/lng to 3D coordinates
function latLngToXYZ(lat: number, lng: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return {
    x: -radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  }
}

// Generate Fibonacci sphere points
function generateFibonacciSphere(numPoints: number, radius: number) {
  const points: { x: number; y: number; z: number }[] = []
  const goldenRatio = (1 + Math.sqrt(5)) / 2
  const angleIncrement = Math.PI * 2 * goldenRatio

  for (let i = 0; i < numPoints; i++) {
    const t = i / numPoints
    const inclination = Math.acos(1 - 2 * t)
    const azimuth = angleIncrement * i

    const x = radius * Math.sin(inclination) * Math.cos(azimuth)
    const y = radius * Math.sin(inclination) * Math.sin(azimuth)
    const z = radius * Math.cos(inclination)

    points.push({ x, y, z })
  }

  return points
}

// Rotate point around Y axis
function rotateY(point: { x: number; y: number; z: number }, angle: number) {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    x: point.x * cos - point.z * sin,
    y: point.y,
    z: point.x * sin + point.z * cos,
  }
}

// Rotate point around X axis
function rotateX(point: { x: number; y: number; z: number }, angle: number) {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    x: point.x,
    y: point.y * cos - point.z * sin,
    z: point.y * sin + point.z * cos,
  }
}

// Generate arc points between two positions
function generateArcPoints(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  radius: number,
  numPoints: number = 50
) {
  const points: { x: number; y: number; z: number }[] = []

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints

    // Linear interpolation
    let x = from.x + (to.x - from.x) * t
    let y = from.y + (to.y - from.y) * t
    let z = from.z + (to.z - from.z) * t

    // Normalize to sphere surface with arc height
    const len = Math.sqrt(x * x + y * y + z * z)
    const arcHeight = 1 + 0.2 * Math.sin(t * Math.PI) // 20% height at middle

    x = (x / len) * radius * arcHeight
    y = (y / len) * radius * arcHeight
    z = (z / len) * radius * arcHeight

    points.push({ x, y, z })
  }

  return points
}

export function InteractiveGlobe({
  size = 600,
  dotColor = '#6366f1',
  arcColor = '#22c55e',
  markerColor = '#f59e0b',
  autoRotateSpeed = 0.002,
  connections = [],
  markers = [],
  className = '',
}: InteractiveGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rotationRef = useRef({ x: 0.3, y: 0 })
  const isDraggingRef = useRef(false)
  const lastMouseRef = useRef({ x: 0, y: 0 })
  const animationRef = useRef<number>()
  const particlesRef = useRef<{ t: number; connectionIndex: number }[]>([])

  // Default connections if none provided
  const defaultConnections: Connection[] = [
    { from: { lat: -23.5, lng: -46.6 }, to: { lat: 40.7, lng: -74 } }, // São Paulo -> NYC
    { from: { lat: -23.5, lng: -46.6 }, to: { lat: 51.5, lng: -0.1 } }, // São Paulo -> London
    { from: { lat: -23.5, lng: -46.6 }, to: { lat: 35.7, lng: 139.7 } }, // São Paulo -> Tokyo
    { from: { lat: 40.7, lng: -74 }, to: { lat: 48.9, lng: 2.3 } }, // NYC -> Paris
    { from: { lat: 51.5, lng: -0.1 }, to: { lat: 55.8, lng: 37.6 } }, // London -> Moscow
    { from: { lat: -33.9, lng: 18.4 }, to: { lat: -23.5, lng: -46.6 } }, // Cape Town -> São Paulo
  ]

  // Default markers if none provided
  const defaultMarkers: Marker[] = [
    { lat: -23.5, lng: -46.6, label: 'São Paulo' },
    { lat: 40.7, lng: -74, label: 'New York' },
    { lat: 51.5, lng: -0.1, label: 'London' },
    { lat: 35.7, lng: 139.7, label: 'Tokyo' },
    { lat: 48.9, lng: 2.3, label: 'Paris' },
    { lat: 55.8, lng: 37.6, label: 'Moscow' },
    { lat: -33.9, lng: 18.4, label: 'Cape Town' },
    { lat: 1.3, lng: 103.8, label: 'Singapore' },
  ]

  const activeConnections = connections.length > 0 ? connections : defaultConnections
  const activeMarkers = markers.length > 0 ? markers : defaultMarkers

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = canvas.width / dpr
    const height = canvas.height / dpr
    const centerX = width / 2
    const centerY = height / 2
    const radius = Math.min(width, height) * 0.35

    // Clear canvas
    ctx.clearRect(0, 0, width, height)

    // Draw glow
    const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.8, centerX, centerY, radius * 1.5)
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.15)')
    gradient.addColorStop(0.5, 'rgba(99, 102, 241, 0.05)')
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius * 1.5, 0, Math.PI * 2)
    ctx.fill()

    // Generate and sort points by z for proper depth rendering
    const fibPoints = generateFibonacciSphere(1200, radius)
    const rotatedPoints = fibPoints.map((p) => {
      let rotated = rotateY(p, rotationRef.current.y)
      rotated = rotateX(rotated, rotationRef.current.x)
      return rotated
    })

    // Sort by z (furthest first)
    const sortedPoints = rotatedPoints
      .map((p, i) => ({ ...p, index: i }))
      .sort((a, b) => a.z - b.z)

    // Draw dots
    sortedPoints.forEach((point) => {
      if (point.z < 0) return // Only draw front-facing points

      const scale = (point.z + radius) / (2 * radius)
      const x = centerX + point.x
      const y = centerY + point.y
      const dotSize = 1 + scale * 1.5
      const opacity = 0.3 + scale * 0.7

      ctx.beginPath()
      ctx.arc(x, y, dotSize, 0, Math.PI * 2)
      ctx.fillStyle = dotColor + Math.floor(opacity * 255).toString(16).padStart(2, '0')
      ctx.fill()
    })

    // Draw connections (arcs)
    activeConnections.forEach((conn, connIndex) => {
      const fromXYZ = latLngToXYZ(conn.from.lat, conn.from.lng, radius)
      const toXYZ = latLngToXYZ(conn.to.lat, conn.to.lng, radius)

      let fromRotated = rotateY(fromXYZ, rotationRef.current.y)
      fromRotated = rotateX(fromRotated, rotationRef.current.x)

      let toRotated = rotateY(toXYZ, rotationRef.current.y)
      toRotated = rotateX(toRotated, rotationRef.current.x)

      // Only draw if at least one endpoint is visible
      if (fromRotated.z < -radius * 0.3 && toRotated.z < -radius * 0.3) return

      const arcPoints = generateArcPoints(fromXYZ, toXYZ, radius, 50)
      const rotatedArcPoints = arcPoints.map((p) => {
        let rotated = rotateY(p, rotationRef.current.y)
        rotated = rotateX(rotated, rotationRef.current.x)
        return rotated
      })

      // Draw arc
      ctx.beginPath()
      let started = false
      rotatedArcPoints.forEach((point, i) => {
        if (point.z < 0) return // Only draw visible parts

        const x = centerX + point.x
        const y = centerY + point.y

        if (!started) {
          ctx.moveTo(x, y)
          started = true
        } else {
          ctx.lineTo(x, y)
        }
      })
      ctx.strokeStyle = arcColor + '80'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Draw particle traveling on arc
      const particle = particlesRef.current.find((p) => p.connectionIndex === connIndex)
      if (particle) {
        const particleIndex = Math.floor(particle.t * rotatedArcPoints.length)
        if (particleIndex < rotatedArcPoints.length) {
          const point = rotatedArcPoints[particleIndex]
          if (point.z >= 0) {
            const scale = (point.z + radius) / (2 * radius)
            ctx.beginPath()
            ctx.arc(centerX + point.x, centerY + point.y, 3 + scale * 2, 0, Math.PI * 2)
            ctx.fillStyle = arcColor
            ctx.fill()

            // Glow effect
            const glowGradient = ctx.createRadialGradient(
              centerX + point.x,
              centerY + point.y,
              0,
              centerX + point.x,
              centerY + point.y,
              10
            )
            glowGradient.addColorStop(0, arcColor + '80')
            glowGradient.addColorStop(1, arcColor + '00')
            ctx.fillStyle = glowGradient
            ctx.beginPath()
            ctx.arc(centerX + point.x, centerY + point.y, 10, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
    })

    // Draw markers
    activeMarkers.forEach((marker) => {
      const xyz = latLngToXYZ(marker.lat, marker.lng, radius)
      let rotated = rotateY(xyz, rotationRef.current.y)
      rotated = rotateX(rotated, rotationRef.current.x)

      if (rotated.z < 0) return // Only draw visible markers

      const x = centerX + rotated.x
      const y = centerY + rotated.y
      const scale = (rotated.z + radius) / (2 * radius)
      const markerSize = 4 + scale * 4

      // Outer glow
      const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, markerSize * 2)
      glowGradient.addColorStop(0, markerColor + '60')
      glowGradient.addColorStop(1, markerColor + '00')
      ctx.fillStyle = glowGradient
      ctx.beginPath()
      ctx.arc(x, y, markerSize * 2, 0, Math.PI * 2)
      ctx.fill()

      // Marker dot
      ctx.beginPath()
      ctx.arc(x, y, markerSize, 0, Math.PI * 2)
      ctx.fillStyle = markerColor
      ctx.fill()

      // Inner white dot
      ctx.beginPath()
      ctx.arc(x, y, markerSize * 0.4, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
    })
  }, [dotColor, arcColor, markerColor, activeConnections, activeMarkers])

  const animate = useCallback(() => {
    // Auto-rotate when not dragging
    if (!isDraggingRef.current) {
      rotationRef.current.y += autoRotateSpeed
    }

    // Update particles
    if (particlesRef.current.length < activeConnections.length) {
      // Initialize particles for each connection
      activeConnections.forEach((_, i) => {
        if (!particlesRef.current.find((p) => p.connectionIndex === i)) {
          particlesRef.current.push({
            t: Math.random(),
            connectionIndex: i,
          })
        }
      })
    }

    particlesRef.current.forEach((particle) => {
      particle.t += 0.005
      if (particle.t > 1) {
        particle.t = 0
      }
    })

    render()
    animationRef.current = requestAnimationFrame(animate)
  }, [render, autoRotateSpeed, activeConnections])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Set up canvas with device pixel ratio
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(dpr, dpr)
    }

    // Start animation
    animate()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [size, animate])

  // Mouse handlers for drag rotation
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true
    lastMouseRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return

    const deltaX = e.clientX - lastMouseRef.current.x
    const deltaY = e.clientY - lastMouseRef.current.y

    rotationRef.current.y += deltaX * 0.005
    rotationRef.current.x += deltaY * 0.005

    // Clamp X rotation
    rotationRef.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationRef.current.x))

    lastMouseRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseUp = () => {
    isDraggingRef.current = false
  }

  const handleMouseLeave = () => {
    isDraggingRef.current = false
  }

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isDraggingRef.current = true
      lastMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current || e.touches.length !== 1) return

    const deltaX = e.touches[0].clientX - lastMouseRef.current.x
    const deltaY = e.touches[0].clientY - lastMouseRef.current.y

    rotationRef.current.y += deltaX * 0.005
    rotationRef.current.x += deltaY * 0.005

    rotationRef.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationRef.current.x))

    lastMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  const handleTouchEnd = () => {
    isDraggingRef.current = false
  }

  return (
    <canvas
      ref={canvasRef}
      className={`cursor-grab active:cursor-grabbing ${className}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    />
  )
}
