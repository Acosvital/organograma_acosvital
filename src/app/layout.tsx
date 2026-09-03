import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { auth } from '@/lib/session';
import { DEV_AUTH_BYPASS } from '@/lib/devAuth';
import AuthProvider from '@/components/AuthProvider';
import SidebarShell from '@/components/Sidebar/SidebarShell';
import { LOGO_URL } from '@/lib/constants';
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display font — títulos e números de destaque (geométrica, técnica).
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// Define o tema antes da primeira pintura para evitar flash de tema incorreto.
const THEME_INIT = `(function(){try{var t=localStorage.getItem('theme');if(t==='light')document.documentElement.dataset.theme='light';}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Organograma — Acos Vital",
  description: "Estrutura organizacional em formato radial",
  icons: { icon: LOGO_URL },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // E-mail é best-effort para o rodapé da sidebar.
  let userEmail: string | undefined;
  if (DEV_AUTH_BYPASS) {
    userEmail = 'dev@local';
  } else {
    try {
      const session = await auth();
      userEmail = session?.user?.email ?? undefined;
    } catch {}
  }

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {/* Fira Sans — fonte das labels geográficas no canvas do globo */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <AuthProvider>
          <SidebarShell userEmail={userEmail}>
            {children}
          </SidebarShell>
        </AuthProvider>
      </body>
    </html>
  );
}
