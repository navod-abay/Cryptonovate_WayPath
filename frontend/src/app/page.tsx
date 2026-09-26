import React from 'react';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-8">
      <div className="max-w-4xl w-full text-center space-y-6">
        <span className="px-3 py-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-full text-sm font-semibold tracking-wide">
          SaaS Delivery Planning Platform
        </span>
        <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 bg-clip-text text-transparent">
          Enterprise Multi-Role Logistics Suite
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
          High-performance microservices platform powering automated dispatching, driver routing, store loading, and real-time execution analytics.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-8">
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl hover:border-cyan-500/40 transition">
            <h3 className="text-cyan-400 font-bold text-lg mb-2">Dispatcher Hub</h3>
            <p className="text-slate-400 text-sm">Real-time route allocation & optimization dashboard.</p>
          </div>
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl hover:border-blue-500/40 transition">
            <h3 className="text-blue-400 font-bold text-lg mb-2">Driver Sync</h3>
            <p className="text-slate-400 text-sm">Mobile-first turn-by-turn & POD delivery interface.</p>
          </div>
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl hover:border-indigo-500/40 transition">
            <h3 className="text-indigo-400 font-bold text-lg mb-2">Loader Portal</h3>
            <p className="text-slate-400 text-sm">Warehouse loading queue & inventory check-in.</p>
          </div>
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl hover:border-purple-500/40 transition">
            <h3 className="text-purple-400 font-bold text-lg mb-2">Store Manager</h3>
            <p className="text-slate-400 text-sm">Inbound delivery schedule & ETA prediction tracking.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
