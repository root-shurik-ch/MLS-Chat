import React from 'react';
import { Shield, Fingerprint, Zap, Globe, ArrowRight, Lock, MessageSquare } from 'lucide-react';
import { Button } from './ui/Button';

interface LandingPageProps {
  onGetStarted: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-purple-500/30 overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/5 bg-black/50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-purple-500" />
            <span className="font-mono text-sm tracking-widest uppercase font-semibold">MLS-Chat</span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={onGetStarted} className="hidden md:flex text-white/70 hover:text-white">
              Log in
            </Button>
            <Button onClick={onGetStarted} className="bg-white text-black hover:bg-white/90 rounded-full px-6">
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero Section */}
        <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-6 max-w-7xl mx-auto">
          {/* Background glowing effects */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-blue-600/20 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative z-10 grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            {/* Hero Content */}
            <div className="max-w-2xl text-center lg:text-left mx-auto lg:mx-0">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-400 text-xs font-mono uppercase tracking-wider mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                </span>
                End-to-End Encrypted
              </div>
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white via-white/90 to-white/50">
                Maximum Privacy. <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-500">
                  Zero Trust.
                </span>
              </h1>
              <p className="text-lg md:text-xl text-white/40 mb-8 leading-relaxed max-w-xl mx-auto lg:mx-0">
                The next-generation chat app built with Messaging Layer Security (MLS) and Passkeys. Your keys stay on your device. We store only ciphertext. No exceptions.
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
                <Button 
                  onClick={onGetStarted} 
                  className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-full px-8 py-6 text-lg font-medium shadow-[0_0_40px_-10px_rgba(168,85,247,0.5)] transition-all hover:scale-105"
                >
                  Start Chatting Securely
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
                <a href="https://github.com/your-org/mls-chat" target="_blank" rel="noreferrer" className="w-full sm:w-auto">
                  <Button variant="ghost" className="w-full rounded-full px-8 py-6 text-lg text-white/70 hover:text-white border border-white/10 hover:bg-white/5">
                    View on GitHub
                  </Button>
                </a>
              </div>
            </div>

            {/* Hero Visual Mockup */}
            <div className="relative mx-auto w-full max-w-lg lg:max-w-none perspective-[2000px]">
              <div className="relative rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-2 shadow-2xl transform rotate-y-[-10deg] rotate-x-[5deg] hover:rotate-y-0 hover:rotate-x-0 transition-transform duration-700 ease-out">
                <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/10 via-transparent to-blue-500/10 rounded-2xl pointer-events-none" />
                <div className="rounded-xl overflow-hidden border border-white/5 bg-[#0A0A0A] aspect-[4/3] flex flex-col">
                  {/* Fake UI Header */}
                  <div className="h-12 border-b border-white/5 flex items-center px-4 gap-4 bg-white/[0.02]">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-white/10" />
                      <div className="w-3 h-3 rounded-full bg-white/10" />
                      <div className="w-3 h-3 rounded-full bg-white/10" />
                    </div>
                    <div className="flex-1 flex justify-center">
                      <div className="h-4 w-32 bg-white/5 rounded-full" />
                    </div>
                  </div>
                  {/* Fake UI Body */}
                  <div className="flex-1 flex p-4 gap-4">
                    <div className="w-1/3 hidden sm:flex flex-col gap-3 border-r border-white/5 pr-4">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="flex gap-3 items-center">
                          <div className="w-10 h-10 rounded-full bg-white/5 shrink-0" />
                          <div className="space-y-2 flex-1">
                            <div className="h-3 bg-white/10 rounded w-full" />
                            <div className="h-2 bg-white/5 rounded w-2/3" />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex-1 flex flex-col gap-4">
                      <div className="flex gap-3 items-end">
                        <div className="w-8 h-8 rounded-full bg-purple-500/20 shrink-0" />
                        <div className="bg-white/5 p-3 rounded-2xl rounded-bl-sm text-sm text-white/50 w-3/4">
                          <div className="h-2 bg-white/20 rounded w-full mb-2" />
                          <div className="h-2 bg-white/20 rounded w-4/5" />
                        </div>
                      </div>
                      <div className="flex gap-3 items-end justify-end">
                        <div className="bg-gradient-to-r from-purple-600/80 to-blue-600/80 p-3 rounded-2xl rounded-br-sm text-sm w-2/3 shadow-lg border border-purple-500/20">
                          <div className="h-2 bg-white/40 rounded w-full mb-2" />
                          <div className="h-2 bg-white/40 rounded w-1/2" />
                        </div>
                      </div>
                      <div className="mt-auto relative">
                        <div className="h-10 bg-white/5 rounded-full w-full border border-white/10 flex items-center px-4">
                          <div className="h-3 w-1/3 bg-white/10 rounded" />
                        </div>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-purple-500/50" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 border-t border-white/5 relative bg-black">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Uncompromising Architecture</h2>
              <p className="text-white/40 max-w-2xl mx-auto">Built from the ground up to guarantee privacy without sacrificing user experience.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                {
                  icon: <Shield className="w-6 h-6 text-purple-400" />,
                  title: "MLS Cryptography",
                  desc: "State-of-the-art Messaging Layer Security protocol. Key management and encryption happen entirely on your device."
                },
                {
                  icon: <Fingerprint className="w-6 h-6 text-blue-400" />,
                  title: "Passkey Authentication",
                  desc: "Say goodbye to passwords. Hardware-backed, biometric logins via WebAuthn for maximum account security."
                },
                {
                  icon: <Zap className="w-6 h-6 text-yellow-400" />,
                  title: "Multi-Device Sync",
                  desc: "Seamlessly synchronize your encrypted chat history across all your devices without compromising end-to-end security."
                },
                {
                  icon: <Globe className="w-6 h-6 text-emerald-400" />,
                  title: "Cloud-Agnostic",
                  desc: "Flexible backend architecture. Deploy anywhere—starting with Supabase, entirely open-source."
                }
              ].map((feature, idx) => (
                <div key={idx} className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors group">
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                  <p className="text-white/40 text-sm leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 text-center text-white/30 text-sm">
        <p>Open Source &bull; MIT License</p>
        <p className="mt-2 text-white/20 font-mono text-xs uppercase tracking-widest">minimum.chat</p>
      </footer>
    </div>
  );
};

export default LandingPage;
