export const MaintenanceNetwork = () => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
    <svg className="h-full w-full" viewBox="0 0 960 720" preserveAspectRatio="none">
      <defs>
        <radialGradient id="maintenanceGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="40%" stopColor="#8cebf3" stopOpacity="0.52" />
          <stop offset="100%" stopColor="#8cebf3" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="maintenanceWash" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#d9f5f8" stopOpacity="0.88" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M570 0h390v250c-78-62-134-136-214-180C690 39 634 16 570 0Z" fill="url(#maintenanceWash)" />
      <path d="M0 460c88 48 140 112 190 179 25 34 54 62 96 81H0V460Z" fill="url(#maintenanceWash)" />
      <g stroke="#63bdc9" strokeWidth="1.2" strokeOpacity="0.35" fill="none">
        <path d="M595 0 645 36 712 13 792 55 862 0" />
        <path d="M645 36 674 121 762 137 848 97 960 138" />
        <path d="M595 0 624 130 674 121 712 13" />
        <path d="M712 13 762 137 792 55 848 97" />
        <path d="M624 130 728 218 762 137 900 217" />
        <path d="M848 97 960 138 922 307 866 398 960 495" />
        <path d="M762 137 900 217 922 307" />
        <path d="M0 515 70 460 138 524 240 492 310 590" />
        <path d="M0 620 92 575 180 650 275 620 360 720" />
        <path d="M70 460 180 650 240 492 350 520" />
        <path d="M0 690 92 575 16 626" />
        <path d="M180 650 226 720 275 620 360 720" />
      </g>
      <g fill="#11899a" fillOpacity="0.78">
        {[
          [595, 0, 4], [645, 36, 4], [712, 13, 3.6], [792, 55, 4.5], [862, 0, 3.5],
          [624, 130, 3.8], [674, 121, 4], [762, 137, 4.6], [848, 97, 3.8], [960, 138, 4.2],
          [728, 218, 3.4], [900, 217, 3.5], [922, 307, 4.6], [866, 398, 3.4], [960, 495, 4.4],
          [0, 515, 4.2], [70, 460, 3.5], [138, 524, 3.8], [240, 492, 4], [350, 520, 3.4],
          [16, 626, 4.4], [92, 575, 4], [180, 650, 4], [275, 620, 4.2], [226, 720, 3.8], [360, 720, 4.2],
        ].map(([cx, cy, r], index) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r={r}
            className="motion-safe:animate-[maintenance-node-pulse_3.8s_ease-in-out_infinite]"
            style={{ animationDelay: `${(index % 7) * 240}ms`, animationDuration: `${3.4 + (index % 5) * 0.35}s` }}
          />
        ))}
      </g>
      <g opacity="0.9">
        <circle cx="792" cy="55" r="42" fill="url(#maintenanceGlow)" className="motion-safe:animate-[maintenance-glow_5s_ease-in-out_infinite]" />
        <circle cx="960" cy="138" r="32" fill="url(#maintenanceGlow)" className="motion-safe:animate-[maintenance-glow_5.8s_ease-in-out_infinite]" />
        <circle cx="0" cy="515" r="34" fill="url(#maintenanceGlow)" className="motion-safe:animate-[maintenance-glow_5.4s_ease-in-out_infinite]" />
        <circle cx="92" cy="575" r="30" fill="url(#maintenanceGlow)" className="motion-safe:animate-[maintenance-glow_4.8s_ease-in-out_infinite]" />
      </g>
    </svg>
  </div>
);
