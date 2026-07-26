import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";
import V4Nav from "../components/V4Nav";
import V4Footer from "../components/V4Footer";
import SiteScripts from "../components/SiteScripts";

export const metadata: Metadata = {
  title: "Artikkelit | Vinkkejä muuttosiivoukseen",
  description: "Oppaita muuttosiivoukseen, vuokravakuuden takaisin saamiseen ja kotitalousvähennykseen.",
  alternates: { canonical: "https://lasikiilto.fi/artikkelit" },
};

export default function Artikkelit() {
  const posts = getAllPosts();
  return (
    <div className="v4">
      <V4Nav />
      <section className="subhero"><div className="wrap">
        <div className="crumbs"><Link href="/">Etusivu</Link><span>/</span><span>Artikkelit</span></div>
        <h1>Artikkelit</h1>
        <p>Oppaita ja vinkkejä muuttosiivoukseen, vuokravakuuden takaisin saamiseen ja kotitalousvähennykseen.</p>
      </div></section>

      <section className="sec"><div className="wrap">
        {posts.length === 0 ? (
          <p className="center lead">Artikkeleita tulossa pian — pysy kuulolla!</p>
        ) : (
          <div className="bloglist">
            {posts.map((post) => (
              <Link key={post.slug} href={`/artikkelit/${post.slug}`} className="blogitem">
                <h3>{post.title}</h3>
                <p>{post.description}</p>
                <div className="meta">
                  {new Date(post.date).toLocaleDateString("fi-FI", { day: "numeric", month: "long", year: "numeric" })}
                  {post.readingTime ? ` · ${post.readingTime}` : ""} →
                </div>
              </Link>
            ))}
          </div>
        )}
      </div></section>

      <V4Footer />
      <SiteScripts />
    </div>
  );
}
