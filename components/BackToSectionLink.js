import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Renders a back link to the island's section.
 * Fallback: links to /courses/{courseId} with label "← Panel".
 */
export default function BackToSectionLink({ courseId, islandId, className }) {
  const [href, setHref] = useState(null);
  const [label, setLabel] = useState('← Panel');

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        // 1) get section_id from the island
        const { data: isl, error: islErr } = await supabase
          .from('islands')
          .select('section_id')
          .eq('id', islandId)
          .maybeSingle();

        if (islErr || !isl?.section_id) throw islErr || new Error('No section_id');

        // 2) get slug + title from the section
        const { data: sec, error: secErr } = await supabase
          .from('sections')
          .select('slug, title')
          .eq('id', isl.section_id)
          .maybeSingle();

        if (secErr || !sec?.slug) throw secErr || new Error('No section slug');

        if (!alive) return;
        setHref(`/courses/${courseId}/sections/${sec.slug}`);
        setLabel(`← ${sec.title}`);
      } catch {
        if (!alive) return;
        setHref(`/courses/${courseId}`);
        setLabel('← Panel');
      }
    }

    if (courseId && islandId) load();
    return () => {
      alive = false;
    };
  }, [courseId, islandId]);

  return (
    <Link
      href={href || `/courses/${courseId}`}
      className={
        className ||
        'inline-block rounded-xl border border-gray-900 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50'
      }
    >
      {label}
    </Link>
  );
}