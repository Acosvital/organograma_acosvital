import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { createClient } from '@/lib/supabase/server';
import { getMyRole } from '@/lib/apiAuth';
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
  // Papel via helper único (item 9); e-mail é best-effort para o rodapé da sidebar.
  const role = await getMyRole();
  const isAdmin = role === 'admin' || role === 'editor';
  let userEmail: string | undefined;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userEmail = user?.email;
  } catch {}

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
        <SidebarShell isAdmin={isAdmin} userEmail={userEmail}>
          {children}
        </SidebarShell>
      </body>
    </html>
  );
}
