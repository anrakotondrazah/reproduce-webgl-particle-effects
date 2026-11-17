import ParticleWave from './components/ParticleWave';

const NAV = ['Home', 'Programs', 'Community', 'Journal'];

export default function App() {
  return (
    <div className="relative h-screen min-h-[560px] overflow-hidden bg-black font-sans text-white">
      {/* WebGL particle ridge – full-bleed behind the content */}
      <div className="absolute inset-0">
        <ParticleWave className="h-full w-full" />
        {/* Gentle fade of the bottom edge into black */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 md:px-10">
          <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-zinc-300">
            <span className="inline-block h-2 w-2 rounded-full bg-gradient-to-br from-sky-400 to-orange-400" />
            Growth Lab
          </div>
          <nav className="hidden gap-8 text-xs text-zinc-500 md:flex">
            {NAV.map((item) => (
              <a key={item} href="#" className="transition-colors hover:text-zinc-200">
                {item}
              </a>
            ))}
          </nav>
          <button className="rounded-full border border-white/10 px-4 py-1.5 text-xs text-zinc-300 transition hover:border-white/25 hover:text-white">
            Sign in
          </button>
        </header>

        <main className="mx-auto w-full max-w-6xl px-6 pt-[10vh] md:px-10">
          <h1 className="max-w-md text-3xl font-medium leading-tight tracking-tight text-zinc-300/80 md:text-5xl">
            Everything revolves
            <br />
            around one thing —
            <br />
            <span className="text-zinc-200">your growth.</span>
          </h1>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-zinc-500">
            Small daily rituals, guided reflection and a community that pushes you
            forward. Build habits that compound, one quiet step at a time.
          </p>
          <div className="mt-7 flex items-center gap-5 text-xs">
            <button className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-zinc-200 backdrop-blur transition hover:bg-white/10">
              Start your journey
            </button>
            <a href="#" className="text-zinc-500 transition hover:text-zinc-300">
              Watch the film ↗
            </a>
          </div>
        </main>

        <footer className="mt-auto mx-auto flex w-full max-w-6xl items-center justify-between px-6 pb-6 text-[11px] text-zinc-600 md:px-10">
          <span className="flex items-center gap-2">
            <span className="text-zinc-300">↗</span> New Era
          </span>
          <span>Health / Science</span>
        </footer>
      </div>
    </div>
  );
}
