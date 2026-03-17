import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import ChatPage from './pages/ChatPage';
import TradePage from './pages/TradePage';

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-bg-dark text-white">
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/trade" element={<TradePage />} />
            <Route path="/agent-status" element={<div className="pt-32 text-center font-mono">AGENT STATUS MODULE: LOADING...</div>} />
          </Routes>
        </main>
        
        {/* Global Grain Overlay */}
        <div className="fixed inset-0 pointer-events-none opacity-[0.03] mix-blend-overlay z-[9999]">
          <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <filter id="noiseFilter">
              <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
            </filter>
            <rect width="100%" height="100%" filter="url(#noiseFilter)" />
          </svg>
        </div>
      </div>
    </Router>
  );
}
