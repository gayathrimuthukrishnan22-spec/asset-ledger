// ======================================================
// File Name : AppLayout.jsx
// Purpose   : Implements AppLayout
// ======================================================

import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Footer } from './Footer';
import { BottomNav } from './BottomNav';
import { ChatLaunchers } from '../components/chat/ChatWidget';
import './layout.css';


// ======================================================
// START: Layout Component
// ======================================================

const MOBILE_QUERY = '(max-width: 1000px)';

// ======================================================
// Function : useIsMobile
// Purpose  : Custom hook that provides 'useIsMobile' state/behaviour
// ======================================================

function useIsMobile() {
    const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches);
    useEffect(() => {
        const mql = window.matchMedia(MOBILE_QUERY);
        const handler = (e) => setIsMobile(e.matches);
        mql.addEventListener('change', handler);
        setIsMobile(mql.matches);
        return () => mql.removeEventListener('change', handler);
    }, []);
    return isMobile;
}

// ======================================================
// END: useIsMobile
// ======================================================

// ======================================================
// Function : AppLayout
// Purpose  : React component that renders the 'AppLayout' UI
// ======================================================

export function AppLayout({ active, title, crumb, children }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const isMobile = useIsMobile();
    return (<div className="app">
      <Sidebar active={active} open={sidebarOpen} onClose={() => setSidebarOpen(false)}/>
      <div className="main">
        <Header title={title} crumb={crumb} menuOpen={sidebarOpen} showMenuToggle={isMobile} onMenuClick={() => setSidebarOpen((v) => !v)}/>
        <div className="content">{children}</div>
        <Footer />
      </div>
      <ChatLaunchers />
      {isMobile && <BottomNav active={active} moreOpen={sidebarOpen} onMoreClick={() => setSidebarOpen((v) => !v)}/>}
    </div>);
}

// ======================================================
// END: AppLayout
// ======================================================

// ======================================================
// END: Layout Component
// ======================================================

// ======================================================
// END OF FILE : AppLayout.jsx
// ======================================================
