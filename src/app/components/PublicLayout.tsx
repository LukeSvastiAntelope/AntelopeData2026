'use client';

import { usePathname } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  return (
    <div className='min-h-screen flex items-center justify-start flex-col'>
      <div className="flex text-white w-full">
        <aside className="md:w-64 md:flex-col md:left-auto left-0 fixed top-0 text-sm w-full">
          <nav className="flex flex-row md:flex-col gap-4 text-normal justify-evenly py-8 px-4">
            <div className="flex flex-row md:flex-col justify-evenly w-full md:gap-4">
              <div className="flex md:inline-block items-center">
                {/* Large logo for md+ */}
                <Link href="/">
                  <span className="hidden md:inline-block">
                    <Image
                      src={"/assets/images/logo-text.svg"}
                      alt="Dashboard Logo"
                      width={160}
                      height={40}
                      className="mr-2 w-100"
                    />
                  </span>
                </Link>
              </div>

              {/* Navigation links */}
              <Link
                href="/dashboard"
                className={`flex items-center group md:gap-2 ${pathname === '/dashboard' ? 'text-white' : 'text-gray-500 hover:text-white'}`}
              >
                <span className={`icon-dashboard-active group-hover:block ${pathname === '/dashboard' ? 'block' : 'hidden'}`} />
                <span className={`icon-dashboard group-hover:hidden ${pathname === '/dashboard' ? 'hidden' : 'block'}`} />
                <span className="hidden font-kodemono md:inline-block">Overview</span>
              </Link>

              <Link
                href="/login"
                className={`flex items-center group md:gap-2 text-gray-500 hover:text-white`}
              >
                <span className={`icon-markets group-hover:hidden block`} />
                <span className={`icon-markets-active group-hover:block hidden`} />
                <span className="hidden font-kodemono md:inline-block">Markets</span>
              </Link>

              <Link
                href="/login"
                className={`flex items-center group md:gap-2 text-gray-500 hover:text-white`}
              >
                <span className={`icon-strategy group-hover:hidden block`} />
                <span className={`icon-strategy-active group-hover:block hidden`} />
                <span className="hidden font-kodemono md:inline-block">Strategy</span>
              </Link>
            </div>

            <div className="md:hidden min-w-40px min-h-40px max-w-40px max-h-40px center-logo"></div>

            <div className="flex flex-row md:flex-col justify-evenly w-full md:gap-4">
              <Link
                href="/about"
                className={`flex items-center group md:gap-2 ${pathname === '/about' ? 'text-white' : 'text-gray-500 hover:text-white'}`}
              >
                <span className={`icon-about-active group-hover:block ${pathname === '/about' ? 'block' : 'hidden'}`} />
                <span className={`icon-about group-hover:hidden ${pathname === '/about' ? 'hidden' : 'block'}`} />
                <span className="hidden font-kodemono md:inline-block">About</span>
              </Link>
              <Link
                href="https://t.me/+PWP890TNaw8zZTI5"
                className="flex items-center md:gap-2 text-gray-500 group"
              >
                <span className="icon-support block group-hover:hidden" />
                <span className="icon-support-active hidden group-hover:block" />
                <span className="text-gray-500 group-hover:text-white font-kodemono">
                  <span className="hidden md:inline-block">Community</span>
                </span>
              </Link>
              <Link
                href="/login"
                className="flex items-center text-gray-500 group md:gap-2"
              >
                <span className="icon-logout block group-hover:hidden" />
                <span className="icon-logout-active hidden group-hover:block" />
                <span className="text-gray-500 group-hover:text-white font-kodemono">
                  <span className="hidden md:inline-block">Login</span>
                </span>
              </Link>
            </div>
          </nav>
        </aside>
        <main className="flex-1 ml-0 md:ml-64 container mt-14 md:mt-0 mx-auto px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
} 