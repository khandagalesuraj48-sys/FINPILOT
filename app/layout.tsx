import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'FINPILOT AI | Financial clarity', description:'Premium personal finance manager with ledgers, EMI tracking and receipt attachments', applicationName:'FINPILOT AI', manifest:'/manifest.json', icons:{icon:'/icon.svg'} };
export const viewport: Viewport = {width:'device-width',initialScale:1,themeColor:'#0a0e17'};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
