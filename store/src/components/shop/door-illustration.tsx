/** The brand's arched-door illustration (from the coming-soon page), shown open. Decorative. */
export function DoorIllustration({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <div className="relative mx-auto w-full max-w-[360px]">
        <div className="rounded-t-full border-[1.5px] border-b-0 border-forest/25 p-3 pb-0">
          <div className="relative aspect-[380/520] overflow-hidden rounded-t-full [perspective:1400px]">
            <svg viewBox="0 0 380 520" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 size-full">
              <defs>
                <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#E4AE58" />
                  <stop offset=".42" stopColor="#F2D398" />
                  <stop offset=".68" stopColor="#FAEBCB" />
                </linearGradient>
                <radialGradient id="hero-sun" cx=".5" cy=".42" r=".62">
                  <stop offset="0" stopColor="#FCD681" />
                  <stop offset="1" stopColor="#EC9A2C" />
                </radialGradient>
                <linearGradient id="hero-road" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#EDCB96" />
                  <stop offset="1" stopColor="#D49C5E" />
                </linearGradient>
              </defs>
              <rect width="380" height="520" fill="url(#hero-sky)" />
              <circle cx="190" cy="318" r="132" fill="#FFF7E2" opacity=".22" />
              <circle cx="190" cy="318" r="102" fill="#FFF7E2" opacity=".3" />
              <circle cx="190" cy="318" r="72" fill="url(#hero-sun)" />
              <path d="M0 340C70 320 140 324 200 334S322 332 380 322V520H0Z" fill="#C6C894" />
              <path d="M0 364C88 342 170 350 250 364S346 370 380 356V520H0Z" fill="#97A96E" />
              <rect x="276" y="349" width="22" height="14" fill="#F3E4C6" />
              <path d="M272 350 287 338 302 350Z" fill="#9E4A2C" />
              <path d="M0 400C64 386 146 382 222 396S340 404 380 392V520H0Z" fill="#62814D" />
              <g fill="none" stroke="#4E6D3E" strokeWidth="5" strokeLinecap="round" strokeDasharray="0 13">
                <path d="M-6 414C80 398 220 402 386 412" />
                <path d="M-6 428C80 413 220 417 386 427" />
              </g>
              <path d="M0 442C80 426 170 428 250 442S352 450 380 444V520H0Z" fill="#2F4F36" />
              <path d="M126 520C150 478 242 462 236 428C231 400 266 378 284 364L290 364C274 380 254 402 262 428C274 466 214 482 254 520Z" fill="url(#hero-road)" />
            </svg>
            <div className="absolute inset-y-0 left-0 w-1/2 origin-left bg-gradient-to-b from-[#25452F] to-[#1A3424] [transform:rotateY(80deg)] brightness-75" />
            <div className="absolute inset-y-0 right-0 w-1/2 origin-right bg-gradient-to-b from-[#25452F] to-[#1A3424] [transform:rotateY(-80deg)] brightness-75" />
          </div>
        </div>
        <div className="absolute -right-[18%] -bottom-px -left-[18%] h-px bg-gradient-to-r from-transparent via-forest/30 to-transparent" />
        <div className="absolute -bottom-7 left-1/2 h-14 w-[130%] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(227,163,59,.35),transparent)]" />
      </div>
    </div>
  );
}
