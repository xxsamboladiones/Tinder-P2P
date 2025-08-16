import React, { useEffect, useState } from 'react'
import { motion, useMotionValue, useTransform } from 'framer-motion'
import { useStore } from '../store'

type Profile = { id: string; name: string; age: number; bio: string; photos: string[] }

export function SwipeDeck() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [index, setIndex] = useState(0)
  const likeProfile = useStore(s => s.likeProfile)
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 0, 200], [-12, 0, 12])

  useEffect(() => {
    ;(async () => {
      // call main process (preload)
      // @ts-ignore
      const data: Profile[] = window.electronAPI ? await window.electronAPI.getProfiles() : []
      setProfiles(data)
    })()
  }, [])

  function advance() {
    // reset position for next card
    x.set(0)
    setIndex(i => Math.min(i + 1, profiles.length))
  }

  function like() {
    const id = profiles[index]?.id
    if (id) likeProfile(id)
    advance()
  }
  function dislike() {
    advance()
  }

  function handleDragEnd(_: MouseEvent | TouchEvent | PointerEvent, info: { offset: { x: number } }) {
    if (info.offset.x > 100) {
      like()
    } else if (info.offset.x < -100) {
      dislike()
    } else {
      // snap back
      x.set(0)
    }
  }

  const p = profiles[index]
  if (!p) return <div className="text-center text-gray-500">Sem mais perfis</div>

  return (
    <motion.div
      className="bg-white rounded-2xl shadow p-4 cursor-grab"
      drag="x"
      style={{ x, rotate }}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      onDragEnd={handleDragEnd}
    >
      <div className="h-96 rounded-xl overflow-hidden bg-gray-200 flex items-center justify-center">
        <img src={p.photos[0]} alt={p.name} className="object-cover w-full h-full" />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div>
          <div className="font-bold text-lg">{p.name}, {p.age}</div>
          <div className="text-sm text-gray-600">{p.bio}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={dislike} className="px-4 py-2 rounded-full border">✖</button>
          <button onClick={like} className="px-4 py-2 rounded-full bg-red-500 text-white">❤</button>
        </div>
      </div>
    </motion.div>
  )
}
