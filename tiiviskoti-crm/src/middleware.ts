import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/* Uusii Supabase-istunnon evästeet. Ilman tätä pääsytunnus vanhenisi
   tunnissa, koska Server Component ei saa kirjoittaa evästeitä. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    },
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Julkinen rajapinta ja staattiset tiedostot eivät tarvitse istuntoa.
  matcher: ['/((?!api/public|_next/static|_next/image|favicon.ico).*)'],
};
