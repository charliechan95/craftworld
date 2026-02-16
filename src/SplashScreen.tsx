import { useState, useEffect, useRef, useCallback } from 'react';

interface SplashScreenProps {
  loadingProgress: number;
  isLoaded: boolean;
  onPlay: () => void;
}

// Minecraft-style pixelated block icon using canvas
function BlockIcon({ type, size = 40 }: { type: 'grass' | 'dirt' | 'stone' | 'wood' | 'diamond'; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = size;
    canvas.height = size;
    ctx.imageSmoothingEnabled = false;

    const colors: Record<string, { top: string; side: string; dark: string }> = {
      grass: { top: '#5d9e3c', side: '#8b6b3d', dark: '#4a8030' },
      dirt: { top: '#8b6b3d', side: '#7a5c30', dark: '#6b4d28' },
      stone: { top: '#999999', side: '#888888', dark: '#666666' },
      wood: { top: '#a07840', side: '#6b4226', dark: '#553318' },
      diamond: { top: '#4dd9e8', side: '#2ab5c4', dark: '#1e8e9a' },
    };

    const c = colors[type];
    const s = size;
    const half = s / 2;

    // Top face (isometric)
    ctx.fillStyle = c.top;
    ctx.beginPath();
    ctx.moveTo(half, 0);
    ctx.lineTo(s, s * 0.25);
    ctx.lineTo(half, s * 0.5);
    ctx.lineTo(0, s * 0.25);
    ctx.closePath();
    ctx.fill();

    // Left face
    ctx.fillStyle = c.side;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.25);
    ctx.lineTo(half, s * 0.5);
    ctx.lineTo(half, s);
    ctx.lineTo(0, s * 0.75);
    ctx.closePath();
    ctx.fill();

    // Right face
    ctx.fillStyle = c.dark;
    ctx.beginPath();
    ctx.moveTo(s, s * 0.25);
    ctx.lineTo(half, s * 0.5);
    ctx.lineTo(half, s);
    ctx.lineTo(s, s * 0.75);
    ctx.closePath();
    ctx.fill();

    // Grid lines for pixelated look
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 0.5;

    // Top grid
    const gridSize = s / 4;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(half - i * gridSize / 2, i * s * 0.25 / 4);
      ctx.lineTo(half + i * gridSize / 2, i * s * 0.25 / 4);
      ctx.stroke();
    }
  }, [type, size]);

  return <canvas ref={canvasRef} width={size} height={size} style={{ imageRendering: 'pixelated' }} />;
}

// Animated floating particles for background
function BackgroundParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    interface Particle {
      x: number; y: number; size: number; speed: number;
      color: string; opacity: number; rotation: number; rotSpeed: number;
    }

    const particles: Particle[] = [];
    const colors = ['#5d9e3c', '#8b6b3d', '#888888', '#6b4226', '#d4c478', '#2d8a2d'];

    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: 3 + Math.random() * 8,
        speed: 0.2 + Math.random() * 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        opacity: 0.1 + Math.random() * 0.3,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.02,
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.y -= p.speed;
        p.rotation += p.rotSpeed;

        if (p.y < -20) {
          p.y = canvas.height + 20;
          p.x = Math.random() * canvas.width;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}

export default function SplashScreen({ loadingProgress, isLoaded, onPlay }: SplashScreenProps) {
  const [showScreen, setShowScreen] = useState<'splash' | 'menu'>('splash');
  const [selectedButton, setSelectedButton] = useState(0);
  const [titleAnim, setTitleAnim] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTitleAnim(true), 300);
    return () => clearTimeout(t);
  }, []);

  // Auto-transition from splash to menu when loaded
  useEffect(() => {
    if (isLoaded && showScreen === 'splash') {
      const t = setTimeout(() => setShowScreen('menu'), 800);
      return () => clearTimeout(t);
    }
  }, [isLoaded, showScreen]);

  const handlePlay = useCallback(() => {
    setFadeOut(true);
    setTimeout(onPlay, 600);
  }, [onPlay]);

  // Keyboard navigation
  useEffect(() => {
    if (showScreen !== 'menu') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') setSelectedButton(prev => Math.max(0, prev - 1));
      if (e.key === 'ArrowDown') setSelectedButton(prev => Math.min(2, prev + 1));
      if (e.key === 'Enter') {
        if (selectedButton === 0) handlePlay();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showScreen, selectedButton, handlePlay]);

  return (
    <div
      className={`fixed inset-0 z-[100] transition-opacity duration-500 ${fadeOut ? 'opacity-0' : 'opacity-100'}`}
      style={{ fontFamily: "'Courier New', monospace" }}
    >
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a0a00] via-[#2a1a0a] to-[#0a0a1e]">
        {/* Panorama-like gradient */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: `
              radial-gradient(ellipse 120% 60% at 50% 100%, #3a6b20 0%, transparent 70%),
              radial-gradient(ellipse 80% 40% at 30% 80%, #4a3010 0%, transparent 60%),
              radial-gradient(ellipse 60% 30% at 70% 70%, #2a5a15 0%, transparent 50%)
            `,
          }}
        />
        {/* Voxel skyline silhouette */}
        <div className="absolute bottom-0 left-0 right-0 h-40 opacity-20">
          <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 200 40">
            <path d="M0,40 L0,30 L5,30 L5,25 L10,25 L10,28 L15,28 L15,20 L18,20 L18,15 L21,15 L21,20 L25,20 L25,25 L30,25 L30,22 L35,22 L35,18 L38,18 L38,22 L42,22 L42,28 L48,28 L48,24 L52,24 L52,20 L55,20 L55,12 L58,12 L58,8 L61,8 L61,12 L64,12 L64,20 L68,20 L68,26 L75,26 L75,22 L80,22 L80,18 L84,18 L84,24 L90,24 L90,20 L94,20 L94,16 L97,16 L97,10 L100,10 L100,16 L103,16 L103,20 L108,20 L108,24 L115,24 L115,18 L118,18 L118,14 L122,14 L122,18 L126,18 L126,26 L132,26 L132,22 L138,22 L138,20 L142,20 L142,14 L145,14 L145,10 L148,10 L148,14 L152,14 L152,22 L158,22 L158,26 L165,26 L165,22 L170,22 L170,28 L178,28 L178,24 L185,24 L185,30 L192,30 L192,26 L200,26 L200,40 Z" fill="#1a3a0a" />
          </svg>
        </div>
        <BackgroundParticles />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full">

        {/* SPLASH SCREEN */}
        {showScreen === 'splash' && (
          <div className="flex flex-col items-center">
            {/* Logo */}
            <div className={`transition-all duration-1000 ${titleAnim ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0'}`}>
              {/* Floating blocks around title */}
              <div className="relative">
                <div className="absolute -left-16 -top-4 animate-bounce" style={{ animationDelay: '0s', animationDuration: '3s' }}>
                  <BlockIcon type="grass" size={32} />
                </div>
                <div className="absolute -right-16 -top-2 animate-bounce" style={{ animationDelay: '0.5s', animationDuration: '2.5s' }}>
                  <BlockIcon type="dirt" size={28} />
                </div>
                <div className="absolute -left-10 -bottom-8 animate-bounce" style={{ animationDelay: '1s', animationDuration: '3.5s' }}>
                  <BlockIcon type="stone" size={24} />
                </div>
                <div className="absolute -right-12 -bottom-6 animate-bounce" style={{ animationDelay: '1.5s', animationDuration: '2.8s' }}>
                  <BlockIcon type="wood" size={26} />
                </div>

                <h1 className="text-6xl md:text-8xl font-black tracking-tight text-center" style={{
                  color: '#e8c840',
                  textShadow: '4px 4px 0px #8b6b3d, 6px 6px 0px #5a4020, 0 0 40px rgba(232,200,64,0.3)',
                  letterSpacing: '-2px',
                }}>
                  CRAFT
                </h1>
                <h1 className="text-6xl md:text-8xl font-black tracking-tight text-center -mt-3 md:-mt-4" style={{
                  color: '#5d9e3c',
                  textShadow: '4px 4px 0px #3a6b20, 6px 6px 0px #2a4a15, 0 0 40px rgba(93,158,60,0.3)',
                  letterSpacing: '-2px',
                }}>
                  WORLD
                </h1>
              </div>

              <p className="text-gray-400 text-center mt-4 text-sm tracking-widest uppercase">
                A Voxel Adventure
              </p>
            </div>

            {/* Loading bar */}
            <div className={`mt-12 w-80 transition-all duration-700 delay-500 ${titleAnim ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-xs uppercase tracking-wider">
                  {isLoaded ? 'World Ready!' : 'Generating World...'}
                </span>
                <span className="text-amber-400 text-xs font-bold">{Math.round(loadingProgress)}%</span>
              </div>

              {/* Minecraft-style loading bar */}
              <div className="h-6 bg-[#1a1a1a] border-2 border-[#3a3a3a] rounded-sm relative overflow-hidden">
                {/* Inner border */}
                <div className="absolute inset-0 border border-[#0a0a0a]" />

                {/* Progress fill */}
                <div
                  className="h-full transition-all duration-300 relative"
                  style={{
                    width: `${loadingProgress}%`,
                    background: isLoaded
                      ? 'linear-gradient(180deg, #5dbe3c 0%, #4a9e30 40%, #3a8e24 100%)'
                      : 'linear-gradient(180deg, #5d9e3c 0%, #4a8030 40%, #3a6b20 100%)',
                  }}
                >
                  {/* Pixel grid overlay */}
                  <div className="absolute inset-0" style={{
                    backgroundImage: 'linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)',
                    backgroundSize: '8px 100%',
                  }} />
                  {/* Shine */}
                  <div className="absolute top-0 left-0 right-0 h-1/3 bg-white/10" />
                </div>
              </div>

              {/* Loading details */}
              <div className="mt-2 text-center">
                {!isLoaded && (
                  <span className="text-gray-500 text-xs">
                    {loadingProgress < 30 ? 'Carving terrain...' :
                     loadingProgress < 60 ? 'Planting trees...' :
                     loadingProgress < 80 ? 'Filling oceans...' :
                     'Finishing up...'}
                  </span>
                )}
                {isLoaded && (
                  <span className="text-green-400 text-xs animate-pulse">
                    ✓ World generated successfully
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MAIN MENU */}
        {showScreen === 'menu' && (
          <div className="flex flex-col items-center animate-fadeIn">
            {/* Title */}
            <div className="relative mb-10">
              <div className="absolute -left-20 top-2 animate-bounce" style={{ animationDuration: '3s' }}>
                <BlockIcon type="grass" size={36} />
              </div>
              <div className="absolute -right-20 top-0 animate-bounce" style={{ animationDelay: '0.7s', animationDuration: '2.6s' }}>
                <BlockIcon type="diamond" size={32} />
              </div>

              <h1 className="text-5xl md:text-7xl font-black tracking-tight text-center" style={{
                color: '#e8c840',
                textShadow: '3px 3px 0px #8b6b3d, 5px 5px 0px #5a4020, 0 0 30px rgba(232,200,64,0.2)',
                letterSpacing: '-2px',
              }}>
                CRAFT
              </h1>
              <h1 className="text-5xl md:text-7xl font-black tracking-tight text-center -mt-2 md:-mt-3" style={{
                color: '#5d9e3c',
                textShadow: '3px 3px 0px #3a6b20, 5px 5px 0px #2a4a15, 0 0 30px rgba(93,158,60,0.2)',
                letterSpacing: '-2px',
              }}>
                WORLD
              </h1>
            </div>

            {/* Menu buttons */}
            <div className="flex flex-col gap-2 w-72">
              {/* Play Button - Minecraft style */}
              <button
                onClick={handlePlay}
                onMouseEnter={() => setSelectedButton(0)}
                className={`relative h-14 text-lg font-bold tracking-wide uppercase transition-all duration-100 ${
                  selectedButton === 0 ? 'scale-105' : 'scale-100'
                }`}
                style={{
                  background: selectedButton === 0
                    ? 'linear-gradient(180deg, #6dbe4c 0%, #5da83c 40%, #4d9830 100%)'
                    : 'linear-gradient(180deg, #5d9e3c 0%, #4a8030 40%, #3a6b20 100%)',
                  border: '3px solid',
                  borderColor: selectedButton === 0 ? '#8dde6c' : '#3a5a20',
                  borderRadius: '3px',
                  color: 'white',
                  textShadow: '2px 2px 0px #2a4a15',
                  boxShadow: selectedButton === 0
                    ? '0 0 20px rgba(93,158,60,0.4), inset 0 2px 0 rgba(255,255,255,0.2)'
                    : 'inset 0 2px 0 rgba(255,255,255,0.1)',
                }}
              >
                <span className="relative z-10">▶ Singleplayer</span>
                {selectedButton === 0 && (
                  <div className="absolute top-0 left-0 right-0 h-1/3 bg-white/10 rounded-t-sm" />
                )}
              </button>

              {/* Settings */}
              <button
                onMouseEnter={() => setSelectedButton(1)}
                className={`relative h-12 text-sm font-bold tracking-wide uppercase transition-all duration-100 ${
                  selectedButton === 1 ? 'scale-105' : 'scale-100'
                }`}
                style={{
                  background: selectedButton === 1
                    ? 'linear-gradient(180deg, #6a6a6a 0%, #555555 40%, #454545 100%)'
                    : 'linear-gradient(180deg, #555555 0%, #444444 40%, #333333 100%)',
                  border: '3px solid',
                  borderColor: selectedButton === 1 ? '#8a8a8a' : '#2a2a2a',
                  borderRadius: '3px',
                  color: selectedButton === 1 ? '#ffffff' : '#aaaaaa',
                  textShadow: '1px 1px 0px #1a1a1a',
                  boxShadow: selectedButton === 1
                    ? 'inset 0 2px 0 rgba(255,255,255,0.15)'
                    : 'inset 0 2px 0 rgba(255,255,255,0.05)',
                }}
              >
                ⚙ Controls & Info
              </button>

              {/* Credits */}
              <button
                onMouseEnter={() => setSelectedButton(2)}
                className={`relative h-12 text-sm font-bold tracking-wide uppercase transition-all duration-100 ${
                  selectedButton === 2 ? 'scale-105' : 'scale-100'
                }`}
                style={{
                  background: selectedButton === 2
                    ? 'linear-gradient(180deg, #6a6a6a 0%, #555555 40%, #454545 100%)'
                    : 'linear-gradient(180deg, #555555 0%, #444444 40%, #333333 100%)',
                  border: '3px solid',
                  borderColor: selectedButton === 2 ? '#8a8a8a' : '#2a2a2a',
                  borderRadius: '3px',
                  color: selectedButton === 2 ? '#ffffff' : '#aaaaaa',
                  textShadow: '1px 1px 0px #1a1a1a',
                  boxShadow: selectedButton === 2
                    ? 'inset 0 2px 0 rgba(255,255,255,0.15)'
                    : 'inset 0 2px 0 rgba(255,255,255,0.05)',
                }}
              >
                ♦ About
              </button>
            </div>

            {/* Controls panel (toggle) */}
            {selectedButton === 1 && (
              <div className="mt-4 w-80 bg-black/70 border-2 border-[#3a3a3a] rounded-sm p-4 animate-fadeIn">
                <h3 className="text-amber-400 font-bold text-sm mb-3 text-center uppercase tracking-wider">Controls</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="text-gray-400">WASD</div><div className="text-gray-300">Move</div>
                  <div className="text-gray-400">Space</div><div className="text-gray-300">Jump / Fly Up</div>
                  <div className="text-gray-400">Shift</div><div className="text-gray-300">Sprint / Fly Down</div>
                  <div className="text-gray-400">F</div><div className="text-gray-300">Toggle Flying</div>
                  <div className="text-gray-400">LMB</div><div className="text-gray-300">Break Block</div>
                  <div className="text-gray-400">RMB</div><div className="text-gray-300">Place Block</div>
                  <div className="text-gray-400">1-9 / Scroll</div><div className="text-gray-300">Select Block</div>
                  <div className="text-gray-400">R</div><div className="text-gray-300">Cycle Weather</div>
                  <div className="text-gray-400">T</div><div className="text-gray-300">Time Speed</div>
                  <div className="text-gray-400">N / B</div><div className="text-gray-300">Night / Day</div>
                  <div className="text-gray-400">M</div><div className="text-gray-300">World Map</div>
                  <div className="text-gray-400">ESC</div><div className="text-gray-300">Release Mouse</div>
                </div>
              </div>
            )}

            {selectedButton === 2 && (
              <div className="mt-4 w-80 bg-black/70 border-2 border-[#3a3a3a] rounded-sm p-4 animate-fadeIn text-center">
                <h3 className="text-amber-400 font-bold text-sm mb-2 uppercase tracking-wider">CraftWorld</h3>
                <p className="text-gray-400 text-xs leading-relaxed">
                  A browser-based voxel world inspired by Minecraft.<br />
                  Built with React, Three.js & TypeScript.<br />
                  Features procedural terrain, biomes, trees,<br />
                  day/night cycle, weather, and more!
                </p>
                <div className="flex justify-center gap-3 mt-3">
                  <BlockIcon type="grass" size={20} />
                  <BlockIcon type="dirt" size={20} />
                  <BlockIcon type="stone" size={20} />
                  <BlockIcon type="wood" size={20} />
                  <BlockIcon type="diamond" size={20} />
                </div>
              </div>
            )}

            {/* Version */}
            <div className="mt-8 text-gray-600 text-xs">
              CraftWorld v1.0 — A Voxel Adventure
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1" style={{
        background: 'linear-gradient(90deg, #5d9e3c, #e8c840, #5d9e3c)',
        opacity: 0.5,
      }} />
    </div>
  );
}
