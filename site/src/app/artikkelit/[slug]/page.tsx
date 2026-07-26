import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getAllPosts, getPostBySlug } from "@/lib/blog";
import V4Nav from "../../components/V4Nav";
import V4Footer from "../../components/V4Footer";
import SiteScripts from "../../components/SiteScripts";

interface Props { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `https://lasikiilto.fi/artikkelit/${slug}` },
    openGraph: {
      title: post.title, description: post.description,
      url: `https://lasikiilto.fi/artikkelit/${slug}`, siteName: "Lasikiilto.fi",
      locale: "fi_FI", type: "article", publishedTime: post.date,
    },
  };
}

const mdxComponents = {
  h2: (p: React.ComponentProps<"h2">) => <h2 {...p} />,
  h3: (p: React.ComponentProps<"h3">) => <h3 {...p} />,
  p: (p: React.ComponentProps<"p">) => <p {...p} />,
  ul: (p: React.ComponentProps<"ul">) => <ul {...p} />,
  li: (p: React.ComponentProps<"li">) => <li {...p} />,
  a: (p: React.ComponentProps<"a">) => <a {...p} />,
  strong: (p: React.ComponentProps<"strong">) => <strong {...p} />,
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  img: (p: React.ComponentProps<"img">) => <img style={{ width: "100%", borderRadius: "var(--r-lg)", margin: "24px 0" }} loading="lazy" {...p} />,
};

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  return (
    <div className="v4">
      <V4Nav />
      <section className="subhero"><div className="wrap">
        <div className="crumbs"><Link href="/">Etusivu</Link><span>/</span><Link href="/artikkelit">Artikkelit</Link></div>
        <h1>{post.title}</h1>
        <p>{post.description}</p>
        <div style={{ fontSize: "13.5px", color: "var(--mute)", marginTop: 14 }}>
          {new Date(post.date).toLocaleDateString("fi-FI", { day: "numeric", month: "long", year: "numeric" })}
          {post.readingTime ? ` · ${post.readingTime}` : ""}
        </div>
      </div></section>

      <section className="sec"><div className="wrap"><div className="article">
        <MDXRemote source={post.content} components={mdxComponents} />
        <p style={{ marginTop: 36 }}><Link href="/artikkelit" style={{ color: "var(--blue)", fontWeight: 600 }}>← Takaisin artikkeleihin</Link></p>
      </div></div></section>

      <V4Footer />
      <SiteScripts />
    </div>
  );
}
