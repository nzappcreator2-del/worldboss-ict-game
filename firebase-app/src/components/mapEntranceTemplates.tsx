// Adventure-map entrance art: ten hand-drawn SVG "landmark gates" the teacher
// can assign to each lesson from the Admin Panel (lessons.mapStyle). Inline
// SVG instead of cropped sheet art on purpose — the same reasoning as
// PvpMode's ModeCardArt: resolution-independent at any node size, no baked
// checkerboard to matte out, and each template stays recolorable in code.
// Gameplay logic (positions, lock/clear state) stays in adventureMapLogic /
// AdventureMap; this file is presentation plus the small resolver used by
// both the map and the admin picker.

import type { ReactElement } from 'react'

export type MapEntranceTemplate = {
  id: string
  name: string
  Art: () => ReactElement
}

export const MAP_ENTRANCE_TEMPLATES: MapEntranceTemplate[] = [
  {
    id: 'forest-gate',
    name: 'ประตูป่าโบราณ',
    Art: () => (
      <svg viewBox="0 0 96 96" role="img" aria-hidden="true">
        <ellipse cx="48" cy="86" rx="34" ry="8" fill="#2c4520" />
        <path d="M20 86V46q0-28 28-28t28 28v40h-12V48q0-16-16-16T32 48v38Z" fill="#6d4a28" stroke="#3c2612" strokeWidth="3" />
        <path d="M32 86V48q0-16 16-16t16 16v38Z" fill="#173c2b" />
        <path d="M36 86V50q0-12 12-12t12 12v36Z" fill="#2f9e58" opacity=".55" />
        <circle cx="48" cy="20" r="7" fill="#8fce5c" stroke="#3c6120" strokeWidth="2.5" />
        <path d="M12 60q8-4 10 4t-8 8Zm72 0q-8-4-10 4t8 8Z" fill="#4c7a2e" />
        <path d="M25 42q-9 2-9 12m55-12q9 2 9 12" fill="none" stroke="#7fb356" strokeWidth="4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'stone-keep',
    name: 'ป้อมหินผา',
    Art: () => (
      <svg viewBox="0 0 96 96" role="img" aria-hidden="true">
        <ellipse cx="48" cy="87" rx="35" ry="7" fill="#3a3f49" />
        <path d="M18 87V40h12v-9h9v9h18v-9h9v9h12v47Z" fill="#8b93a5" stroke="#3f4553" strokeWidth="3" />
        <path d="M18 60h60v6H18Z" fill="#6d7585" />
        <path d="M38 87V62q0-10 10-10t10 10v25Z" fill="#232936" />
        <path d="M42 87V64q0-6 6-6t6 6v23Z" fill="#4c8be0" opacity=".6" />
        <path d="M26 48h8v8h-8Zm36 0h8v8h-8Z" fill="#2c313c" />
        <path d="M44 24l4-12 4 12Z" fill="#d84a3f" stroke="#7c211c" strokeWidth="2" />
        <path d="M48 12v16" stroke="#5b4423" strokeWidth="3" />
      </svg>
    ),
  },
  {
    id: 'crystal-portal',
    name: 'พอร์ทัลคริสตัล',
    Art: () => (
      <svg viewBox="0 0 96 96" role="img" aria-hidden="true">
        <ellipse cx="48" cy="87" rx="32" ry="7" fill="#1d3550" />
        <path d="M48 10 74 30v34L48 86 22 64V30Z" fill="#183a5e" stroke="#0d2038" strokeWidth="3" />
        <path d="M48 20 66 34v26L48 76 30 60V34Z" fill="#2fb7e8" opacity=".85" />
        <path d="M48 20 66 34l-18 8-18-8Z" fill="#9fefff" opacity=".9" />
        <path d="M48 42v34L30 60V34Z" fill="#1673b8" opacity=".7" />
        <circle cx="48" cy="48" r="7" fill="#eafcff" />
        <path d="M14 46l6-3 2 7-6 3Zm62-3 6 3-2 7-6-3Z" fill="#57c8ef" stroke="#1d5f86" strokeWidth="2" />
      </svg>
    ),
  },
  {
    id: 'desert-obelisk',
    name: 'โอเบลิสก์ทะเลทราย',
    Art: () => (
      <svg viewBox="0 0 96 96" role="img" aria-hidden="true">
        <ellipse cx="48" cy="87" rx="34" ry="7" fill="#8a6a35" />
        <path d="M30 87l6-14h24l6 14Z" fill="#caa257" stroke="#77571f" strokeWidth="3" />
        <path d="M38 73 42 18l6-8 6 8 4 55Z" fill="#e8c477" stroke="#8a6425" strokeWidth="3" />
        <path d="M48 10l6 8-4 55h-2Z" fill="#b3893c" />
        <path d="M44 30h8m-8 10h8m-8 10h8" stroke="#7c5c1e" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="48" cy="22" r="4" fill="#ffe08a" stroke="#8a6425" strokeWidth="2" />
        <path d="M16 84q6-6 12 0m40 0q6-6 12 0" fill="none" stroke="#a8823f" strokeWidth="3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'snow-cavern',
    name: 'ถ้ำน้ำแข็ง',
    Art: () => (
      <svg viewBox="0 0 96 96" role="img" aria-hidden="true">
        <ellipse cx="48" cy="87" rx="35" ry="7" fill="#9fc4dd" />
        <path d="M14 87Q18 30 48 22t34 65Z" fill="#dff2fc" stroke="#7fa8c4" strokeWidth="3" />
        <path d="M32 87q1-30 16-30t16 30Z" fill="#12354e" />
        <path d="M36 87q1-24 12-24t12 24Z" fill="#2e7cb0" opacity=".55" />
        <path d="M40 57l3 10 5-12 5 12 3-10" fill="none" stroke="#bfe6f8" strokeWidth="3" strokeLinecap="round" />
        <path d="M24 46l4 8m40-12l-4 9M48 30v8" stroke="#a9d4ea" strokeWidth="3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'mushroom-village',
    name: 'หมู่บ้านเห็ดวิเศษ',
    Art: () => (
      <svg viewBox="0 0 96 96" role="img" aria-hidden="true">
        <ellipse cx="48" cy="87" rx="34" ry="7" fill="#3f5a2a" />
        <path d="M34 87V60q0-9 14-9t14 9v27Z" fill="#e8dcc2" stroke="#8a6a3c" strokeWidth="3" />
        <path d="M43 87V70q0-5 5-5t5 5v17Z" fill="#6b4a26" />
        <path d="M20 62q0-26 28-26t28 26q0 6-8 6H28q-8 0-8-6Z" fill="#d8434e" stroke="#7c1f28" strokeWidth="3" />
        <circle cx="36" cy="50" r="5" fill="#ffe9e0" /><circle cx="56" cy="44" r="6.5" fill="#ffe9e0" /><circle cx="66" cy="56" r="4" fill="#ffe9e0" />
        <path d="M16 80q4-10 10-2m50-4q6-6 8 6" fill="none" stroke="#78a04c" strokeWidth="3" strokeLinecap="round" />
        <circle cx="26" cy="82" r="4" fill="#e8a33c" stroke="#8a5a1c" strokeWidth="2" />
      </svg>
    ),
  },
  {
    id: 'wizard-tower',
    name: 'หอคอยนักปราชญ์',
    Art: () => (
      <svg viewBox="0 0 96 96" role="img" aria-hidden="true">
        <ellipse cx="48" cy="87" rx="32" ry="7" fill="#3a2a52" />
        <path d="M34 87V38q0-8 14-8t14 8v49Z" fill="#8d7bb8" stroke="#463466" strokeWidth="3" />
        <path d="M30 40q18-8 36 0l-6-14H36Z" fill="#5f4a8c" stroke="#38265a" strokeWidth="3" />
        <path d="M36 26q12-6 24 0L48 6Z" fill="#7c4ecb" stroke="#38265a" strokeWidth="3" />
        <circle cx="48" cy="52" r="6" fill="#ffd75e" stroke="#8a6425" strokeWidth="2" />
        <path d="M41 87V74q0-7 7-7t7 7v13Z" fill="#241636" />
        <circle cx="48" cy="8" r="4" fill="#ffe08a" stroke="#a8823f" strokeWidth="2" />
        <path d="M28 60l-6 4m52-4 6 4" stroke="#6c56a0" strokeWidth="3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'bridge-outpost',
    name: 'ด่านสะพานไม้',
    Art: () => (
      <svg viewBox="0 0 96 96" role="img" aria-hidden="true">
        <ellipse cx="48" cy="87" rx="35" ry="7" fill="#2c4a56" />
        <path d="M12 74h72v8H12Z" fill="#8a5f33" stroke="#4c3115" strokeWidth="3" />
        <path d="M20 74V58m14 16V58m28 16V58m14 16V58" stroke="#6d4a28" strokeWidth="5" strokeLinecap="round" />
        <path d="M14 58q34-12 68 0" fill="none" stroke="#a8763f" strokeWidth="5" strokeLinecap="round" />
        <path d="M40 58V30h16v28Z" fill="#c99a52" stroke="#77571f" strokeWidth="3" />
        <path d="M36 30h24l-12-14Z" fill="#d84a3f" stroke="#7c211c" strokeWidth="3" />
        <path d="M44 44h8v14h-8Z" fill="#3a2a18" />
        <path d="M12 82q36 10 72 0" fill="none" stroke="#57c8ef" strokeWidth="3" strokeLinecap="round" opacity=".7" />
      </svg>
    ),
  },
  {
    id: 'volcano-forge',
    name: 'เตาหลอมภูเขาไฟ',
    Art: () => (
      <svg viewBox="0 0 96 96" role="img" aria-hidden="true">
        <ellipse cx="48" cy="87" rx="35" ry="7" fill="#3c1c16" />
        <path d="M14 87 34 30h28l20 57Z" fill="#5c3328" stroke="#2e150f" strokeWidth="3" />
        <path d="M34 30h28l-6 10H40Z" fill="#8a4a34" />
        <path d="M40 20q8 8 16 0l6 10H34Z" fill="#ff7d3c" stroke="#a83318" strokeWidth="3" />
        <path d="M48 12q3 5 0 8-3-3 0-8Z" fill="#ffd75e" />
        <path d="M38 87q-2-22 10-22t10 22Z" fill="#2b0f0a" />
        <path d="M42 87q0-16 6-16t6 16Z" fill="#ff9d2e" opacity=".8" />
        <path d="M26 62l8 6m36-6-8 6" stroke="#c25a34" strokeWidth="3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'royal-castle',
    name: 'ปราสาทหลวง',
    Art: () => (
      <svg viewBox="0 0 96 96" role="img" aria-hidden="true">
        <ellipse cx="48" cy="87" rx="36" ry="7" fill="#41414f" />
        <path d="M16 87V50h12v-8h8v8h24v-8h8v8h12v37Z" fill="#c9cede" stroke="#5b5f73" strokeWidth="3" />
        <path d="M38 50V30q0-8 10-8t10 8v20Z" fill="#8f95ab" stroke="#5b5f73" strokeWidth="3" />
        <path d="M42 24 48 8l6 16Z" fill="#3f74d8" stroke="#1d3f86" strokeWidth="2.5" />
        <path d="M40 87V66q0-8 8-8t8 8v21Z" fill="#2b2e3f" />
        <path d="M44 87V68q0-5 4-5t4 5v19Z" fill="#e8b13c" opacity=".75" />
        <path d="M22 58h8v8h-8Zm44 0h8v8h-8Z" fill="#33364a" />
        <circle cx="48" cy="34" r="4" fill="#ffd75e" stroke="#8a6425" strokeWidth="2" />
      </svg>
    ),
  },
]

export function entranceTemplateById(styleId: string | undefined): MapEntranceTemplate | undefined {
  if (!styleId) return undefined
  return MAP_ENTRANCE_TEMPLATES.find((template) => template.id === styleId)
}

// Lessons saved before the template picker existed (or with a cleared style)
// still get a stable, varied look: rotate through the set by map position.
export function entranceTemplateForLesson(styleId: string | undefined, index: number): MapEntranceTemplate {
  return entranceTemplateById(styleId)
    || MAP_ENTRANCE_TEMPLATES[((index % MAP_ENTRANCE_TEMPLATES.length) + MAP_ENTRANCE_TEMPLATES.length) % MAP_ENTRANCE_TEMPLATES.length]
}
