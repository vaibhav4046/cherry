export interface StarterLibraryChapterSeed {
  readonly timestamp: string;
  readonly timestampSeconds: number;
  readonly chapterTitle: string;
  readonly claim: string;
  readonly nodeTitle: string;
  readonly instruction: string;
}

export interface StarterLibrarySkillSeed {
  readonly source: {
    readonly creator: string;
    readonly title: string;
    readonly canonicalUrl: string;
    readonly disclosure: string;
  };
  readonly mission: {
    readonly title: string;
    readonly objective: string;
  };
  readonly skill: {
    readonly name: string;
    readonly purpose: string;
  };
  readonly chapters: readonly StarterLibraryChapterSeed[];
}

export interface StarterLibraryManifest {
  readonly workspace: {
    readonly name: string;
    readonly description: string;
  };
  readonly skills: readonly StarterLibrarySkillSeed[];
}

export const STARTER_LIBRARY_MANIFEST = {
  workspace: {
    name: 'EXAMPLE — Creator skills starter library',
    description: 'starter-library-v1 — Labelled synthetic reference snapshot with eight creator skills derived only from public uploader, title, and creator-authored chapter metadata. Its reviewed and approved records demonstrate product states; they are not proof of a live user decision. No transcripts, captions, quotations, channel watches, or video downloads. Safe to delete.',
  },
  skills: [
    {
      source: {
        creator: 'YouTube Creators',
        title: 'Titles & Thumbnails',
        canonicalUrl: 'https://www.youtube.com/watch?v=ubFTkoJkNX4',
        disclosure: 'Official YouTube Creators upload. Only public uploader, title, and creator-authored chapter metadata are used.',
      },
      mission: {
        title: 'Plan a video thumbnail and title',
        objective: 'Turn public chapter metadata into a narrow, reviewable thumbnail and title workflow.',
      },
      skill: {
        name: 'Thumbnail and title planning',
        purpose: 'Plan a video thumbnail and title, then schedule an analytics review, using creator-authored chapter metadata as the cited boundary.',
      },
      chapters: [
        {
          timestamp: '00:30', timestampSeconds: 30, chapterTitle: 'Thumbnails: Before You Design',
          claim: 'Place a preparation checkpoint before beginning the thumbnail design.',
          nodeTitle: 'Prepare the thumbnail brief', instruction: 'Write down the thumbnail goal before opening the design tool.',
        },
        {
          timestamp: '01:56', timestampSeconds: 116, chapterTitle: 'Thumbnails: Design Tips',
          claim: 'Separate thumbnail design into its own focused working pass.',
          nodeTitle: 'Design the thumbnail', instruction: 'Run a dedicated thumbnail design pass against the brief.',
        },
        {
          timestamp: '03:17', timestampSeconds: 197, chapterTitle: 'Titles: Types & Tips',
          claim: 'Treat title type and title-writing considerations as a dedicated planning step.',
          nodeTitle: 'Plan the title', instruction: 'Choose a title direction in a separate pass from thumbnail design.',
        },
        {
          timestamp: '05:04', timestampSeconds: 304, chapterTitle: 'Using Analytics to Track Performance & Find Inspiration',
          claim: 'Schedule a later analytics review for title and thumbnail performance.',
          nodeTitle: 'Review performance', instruction: 'Return to analytics after publishing and record what the packaging review shows.',
        },
      ],
    },
    {
      source: {
        creator: 'Dave Jeltema',
        title: 'The YouTube Hook Formula That Actually Works (to blow up your channel)',
        canonicalUrl: 'https://www.youtube.com/watch?v=635ZL8nTsD8',
        disclosure: 'The public description contains affiliate links. No product recommendation or linked offer is used as evidence.',
      },
      mission: {
        title: 'Outline a five-beat opening hook',
        objective: 'Convert five named hook chapters into a concise planning sequence without claiming results.',
      },
      skill: {
        name: 'Five-beat video hook',
        purpose: 'Outline a video hook as an interest spark, pattern interrupt, value turn, credibility beat, and quick move toward value.',
      },
      chapters: [
        {
          timestamp: '03:34', timestampSeconds: 214, chapterTitle: 'Step 1: The Interest Spark',
          claim: 'Begin the hook with an interest-sparking beat.',
          nodeTitle: 'Create an interest spark', instruction: 'Draft one opening beat whose job is to create interest.',
        },
        {
          timestamp: '04:58', timestampSeconds: 298, chapterTitle: 'Step 2: Pattern Interrupt',
          claim: 'Follow the opening with a distinct pattern-interrupt beat.',
          nodeTitle: 'Add a pattern interrupt', instruction: 'Place a clear change of pattern after the initial spark.',
        },
        {
          timestamp: '06:11', timestampSeconds: 371, chapterTitle: 'Step 3: Twist & Value',
          claim: 'Introduce a twist-and-value beat after the interruption.',
          nodeTitle: 'Turn toward value', instruction: 'Draft the beat that connects a twist to the value the viewer can expect.',
        },
        {
          timestamp: '08:30', timestampSeconds: 510, chapterTitle: 'Step 4: Credibility',
          claim: 'Include a dedicated credibility beat in the hook plan.',
          nodeTitle: 'Add credibility', instruction: 'Identify the brief credibility signal the opening needs.',
        },
        {
          timestamp: '09:17', timestampSeconds: 557, chapterTitle: 'Step 5: Speed to Value',
          claim: 'Prioritize a quick move from the hook toward viewer value.',
          nodeTitle: 'Move to value', instruction: 'Trim any opening beat that delays the promised value.',
        },
      ],
    },
    {
      source: {
        creator: 'Justin Brown - Primal Video',
        title: 'How To Write A Script For A YouTube Video (5-Step Template!)',
        canonicalUrl: 'https://www.youtube.com/watch?v=BYwg48M8Zos',
        disclosure: 'The public description includes a general affiliate disclosure. No product recommendation or linked offer is used as evidence.',
      },
      mission: {
        title: 'Outline a YouTube script',
        objective: 'Build a simple script outline from the creator-authored chapter sequence.',
      },
      skill: {
        name: 'Five-part YouTube script',
        purpose: 'Outline a YouTube script with a hook, creator and topic introduction, structured main content, and a call-to-action section.',
      },
      chapters: [
        {
          timestamp: '01:23', timestampSeconds: 83, chapterTitle: 'How To Hook Viewers At The Start Of A Video',
          claim: 'Open the script with a section designed to hook viewers.',
          nodeTitle: 'Write the hook section', instruction: 'Draft the opening hook before the rest of the script.',
        },
        {
          timestamp: '02:00', timestampSeconds: 120, chapterTitle: 'How To Introduce Yourself & The Topic',
          claim: 'Give the creator and topic a dedicated introduction section.',
          nodeTitle: 'Introduce creator and topic', instruction: 'Add a concise section that establishes who is speaking and what the video covers.',
        },
        {
          timestamp: '04:27', timestampSeconds: 267, chapterTitle: 'How To Structure Video Content',
          claim: 'Lay out the main content in an explicit structure.',
          nodeTitle: 'Structure the main content', instruction: 'Arrange the main ideas into an ordered body section.',
        },
        {
          timestamp: '06:51', timestampSeconds: 411, chapterTitle: 'How To Include An Effective Call To Action',
          claim: 'Include a dedicated call-to-action section in the script.',
          nodeTitle: 'Add the call to action', instruction: 'Write one clear next action for the viewer.',
        },
      ],
    },
    {
      source: {
        creator: 'Vanessa Lau',
        title: 'How To Edit YouTube Videos AND Repurpose to Short Form Clips For Beginners (STEP-BY-STEP)',
        canonicalUrl: 'https://www.youtube.com/watch?v=ko3HWNu7CUM',
        disclosure: 'Tool-specific Descript demonstration. The fixture records that context and makes no claim that Descript is required or superior.',
      },
      mission: {
        title: 'Plan a long-form to short-form edit',
        objective: 'Create a tool-aware editing checklist from public chapter labels without generalizing beyond them.',
      },
      skill: {
        name: 'Long-form to short-form edit',
        purpose: 'Plan a Descript-demonstrated edit from cleanup through text, cuts, supporting visuals, and long-form-to-short-form repurposing.',
      },
      chapters: [
        {
          timestamp: '04:52', timestampSeconds: 292, chapterTitle: 'How to Edit Fast',
          claim: 'Make fast editing a named pass in the workflow.',
          nodeTitle: 'Run the fast-edit pass', instruction: 'Complete a focused fast-edit pass in the demonstrated tool context.',
        },
        {
          timestamp: '05:22', timestampSeconds: 322, chapterTitle: 'How to Remove Pauses and Mistakes',
          claim: 'Review the edit for pauses and mistakes to remove.',
          nodeTitle: 'Clean pauses and mistakes', instruction: 'Mark pauses and mistakes, then remove only the selections confirmed for the edit.',
        },
        {
          timestamp: '10:33', timestampSeconds: 633, chapterTitle: 'How to Add Text',
          claim: 'Add a dedicated text pass to the edit.',
          nodeTitle: 'Add text', instruction: 'Place planned on-screen text during its own editing pass.',
        },
        {
          timestamp: '12:07', timestampSeconds: 727, chapterTitle: 'How to Make Seamless Cuts',
          claim: 'Check cuts for seamless transitions as a separate review step.',
          nodeTitle: 'Review the cuts', instruction: 'Inspect each cut and repair transitions that do not feel continuous.',
        },
        {
          timestamp: '15:18', timestampSeconds: 918, chapterTitle: 'How to Add Broll / Graphics',
          claim: 'Include a pass for b-roll or graphics where the edit calls for them.',
          nodeTitle: 'Place supporting visuals', instruction: 'Review the timeline for planned b-roll or graphics.',
        },
        {
          timestamp: '23:22', timestampSeconds: 1402, chapterTitle: 'How to Repurpose Long Form to Short Form',
          claim: 'Treat long-form-to-short-form repurposing as its own workflow stage.',
          nodeTitle: 'Create the short-form cut', instruction: 'Start a separate short-form version from the reviewed long-form edit.',
        },
      ],
    },
    {
      source: {
        creator: 'Think Media',
        title: 'How to Turn 1 Video Into 10+ YouTube Shorts Using AI',
        canonicalUrl: 'https://www.youtube.com/watch?v=K1xoDOxn6mw',
        disclosure: 'The public description states that Submagic sponsored the video and contains affiliate links. Tool-specific chapters are preserved as context, not endorsement.',
      },
      mission: {
        title: 'Compare three Shorts creation routes',
        objective: 'Preserve three chapter-labelled routes while making sponsorship and tool specificity explicit.',
      },
      skill: {
        name: 'Three-route Shorts repurposing',
        purpose: 'Compare three Shorts workflows from a Submagic-sponsored video; treat Submagic as the demonstrated tool, not a required or endorsed choice.',
      },
      chapters: [
        {
          timestamp: '0:40', timestampSeconds: 40, chapterTitle: 'Short 1) Creating Shorts from YouTube videos using AI',
          claim: 'One documented route starts from an existing YouTube video and uses an AI-assisted workflow.',
          nodeTitle: 'Assess the existing-video route', instruction: 'Check whether the source is an existing YouTube video suitable for an AI-assisted route.',
        },
        {
          timestamp: '5:25', timestampSeconds: 325, chapterTitle: 'Short 2) Creating an original Short (with B-roll) in SubMagic',
          claim: 'A second, tool-specific route builds an original short with b-roll in Submagic.',
          nodeTitle: 'Assess the original-short route', instruction: 'Consider the demonstrated Submagic route for an original short with b-roll.',
        },
        {
          timestamp: '9:09', timestampSeconds: 549, chapterTitle: 'Short 3) Creating a Short from your Talking Head A-Roll',
          claim: 'A third route starts from talking-head A-roll.',
          nodeTitle: 'Assess the A-roll route', instruction: 'Check whether talking-head A-roll is the right starting material for the short.',
        },
      ],
    },
    {
      source: {
        creator: 'Think Media',
        title: 'How to Rank in YouTube Search (SEO Beginners Guide)',
        canonicalUrl: 'https://www.youtube.com/watch?v=3NPieJutT9I',
        disclosure: 'The public description states that vidIQ sponsored the video and contains affiliate links. Ranking language is not treated as independent proof.',
      },
      mission: {
        title: 'Plan YouTube search discovery work',
        objective: 'Build a metadata-grounded research and packaging checklist without promising ranking outcomes.',
      },
      skill: {
        name: 'YouTube SEO research and packaging',
        purpose: 'Build a YouTube SEO checklist from public chapter labels in a vidIQ-sponsored video, without treating sponsorship or ranking language as independent proof.',
      },
      chapters: [
        {
          timestamp: '4:00', timestampSeconds: 240, chapterTitle: 'Strategy 1: Research Keywords BEFORE Filming to Understand Audience Demand',
          claim: 'Schedule keyword research before filming to examine audience demand.',
          nodeTitle: 'Research before filming', instruction: 'Collect candidate queries before committing to the filming plan.',
        },
        {
          timestamp: '5:30', timestampSeconds: 330, chapterTitle: 'Strategy 2: Use YouTube Autocomplete to Find Trending Search Queries for Free',
          claim: 'Use YouTube autocomplete as one source of search-query ideas.',
          nodeTitle: 'Check autocomplete', instruction: 'Record relevant autocomplete phrases as research inputs, not guaranteed opportunities.',
        },
        {
          timestamp: '11:53', timestampSeconds: 713, chapterTitle: 'Strategy 4: Answer Specific Questions to Meet Viewer Needs and Increase Engagement',
          claim: 'Center a candidate video around a specific viewer question.',
          nodeTitle: 'Choose a viewer question', instruction: 'State the specific question the proposed video will answer.',
        },
        {
          timestamp: '14:14', timestampSeconds: 854, chapterTitle: 'Strategy 5: Target Long-Tail Keywords with Lower Competition for Better Rankings',
          claim: 'Include lower-competition long-tail queries in topic selection.',
          nodeTitle: 'Review long-tail queries', instruction: 'Compare narrower query candidates during topic selection.',
        },
        {
          timestamp: '18:45', timestampSeconds: 1125, chapterTitle: 'Tip 1: Watch Time and Audience Retention Trump Keywords for YouTube Rankings',
          claim: 'Treat watch time and audience retention as separate priorities from keyword placement.',
          nodeTitle: 'Review retention priorities', instruction: 'Keep the viewing experience in the plan instead of relying on keywords alone.',
        },
        {
          timestamp: '19:51', timestampSeconds: 1191, chapterTitle: 'Tip 2: Improve Click-Through Rate with Compelling Thumbnails and Titles',
          claim: 'Review thumbnail and title click-through rate as part of video packaging.',
          nodeTitle: 'Review packaging', instruction: 'Plan a separate thumbnail and title review for click-through performance.',
        },
        {
          timestamp: '28:56', timestampSeconds: 1736, chapterTitle: 'Tip 6: Use Chapters and Detailed Descriptions to Improve Search Engine Visibility',
          claim: 'Include chapters and a detailed description in the search-visibility checklist.',
          nodeTitle: 'Complete metadata', instruction: 'Add chapters and a detailed description before the publishing review.',
        },
      ],
    },
    {
      source: {
        creator: 'Kevin Stratvert',
        title: 'How to Upload a YouTube Video (Step-by-Step Tutorial for Beginners)',
        canonicalUrl: 'https://www.youtube.com/watch?v=cEackFQ0kY4',
        disclosure: 'The public description contains affiliate links. The publishing steps use chapter metadata only and do not endorse linked products.',
      },
      mission: {
        title: 'Create a YouTube publishing checklist',
        objective: 'Turn public upload chapter labels into a short pre-publish checklist.',
      },
      skill: {
        name: 'YouTube publishing checklist',
        purpose: 'Prepare a YouTube upload by reviewing the title, categorization, chapter markers, and scheduling or publishing choice.',
      },
      chapters: [
        {
          timestamp: '0:25', timestampSeconds: 25, chapterTitle: 'Adding a Title',
          claim: 'Add the video title during the publishing setup.',
          nodeTitle: 'Add the title', instruction: 'Enter the reviewed video title in the upload details.',
        },
        {
          timestamp: '1:04', timestampSeconds: 64, chapterTitle: 'Additional Categorization',
          claim: 'Review the available categorization fields during setup.',
          nodeTitle: 'Review categorization', instruction: 'Check the relevant categorization fields before moving on.',
        },
        {
          timestamp: '1:34', timestampSeconds: 94, chapterTitle: 'Adding Chapter Markers',
          claim: 'Add chapter markers as a dedicated publishing step.',
          nodeTitle: 'Add chapter markers', instruction: 'Enter the planned chapter markers in the video details.',
        },
        {
          timestamp: '3:45', timestampSeconds: 225, chapterTitle: 'How to Schedule or Publish Your Video',
          claim: 'Choose deliberately between scheduling and immediate publishing.',
          nodeTitle: 'Choose release timing', instruction: 'Confirm whether this upload should be scheduled or published now.',
        },
      ],
    },
    {
      source: {
        creator: 'TubeBuddy',
        title: '11 Thumbnail Design Hacks Top Creators Use on YouTube',
        canonicalUrl: 'https://www.youtube.com/watch?v=dB6DXcZo6hE',
        disclosure: 'Creator is the TubeBuddy product channel. The fixture treats the chapter labels as brand-authored metadata, not independent product validation.',
      },
      mission: {
        title: 'Review a YouTube thumbnail',
        objective: 'Create a bounded thumbnail review from brand-authored chapter metadata.',
      },
      skill: {
        name: 'Thumbnail design review',
        purpose: 'Review a thumbnail for brightness, resolution, simplicity, device contexts, research, and test readiness using cited chapter metadata.',
      },
      chapters: [
        {
          timestamp: '00:48', timestampSeconds: 48, chapterTitle: 'Bright gets it right, dark misses the mark',
          claim: 'Review whether the thumbnail reads as bright rather than overly dark.',
          nodeTitle: 'Check brightness', instruction: 'Compare the thumbnail brightness with the intended viewing context.',
        },
        {
          timestamp: '01:18', timestampSeconds: 78, chapterTitle: 'HD is KEY',
          claim: 'Check that the thumbnail asset is high resolution.',
          nodeTitle: 'Check resolution', instruction: 'Confirm the working thumbnail asset is high resolution before export.',
        },
        {
          timestamp: '02:30', timestampSeconds: 150, chapterTitle: 'The less, the better',
          claim: 'Reduce unnecessary elements during a thumbnail simplicity pass.',
          nodeTitle: 'Simplify the design', instruction: 'Remove elements that are not needed for the thumbnail concept.',
        },
        {
          timestamp: '06:00', timestampSeconds: 360, chapterTitle: 'Test, Test, Test',
          claim: 'Make testing an explicit stage of the thumbnail workflow.',
          nodeTitle: 'Plan the test', instruction: 'Define how the thumbnail will be compared or reviewed after release.',
        },
        {
          timestamp: '06:37', timestampSeconds: 397, chapterTitle: 'Optimize for Mobile & TV',
          claim: 'Review the thumbnail in mobile and television viewing contexts.',
          nodeTitle: 'Review device contexts', instruction: 'Inspect the thumbnail at mobile and television-oriented sizes.',
        },
        {
          timestamp: '07:04', timestampSeconds: 424, chapterTitle: 'Do your research',
          claim: 'Include research before finalizing the thumbnail.',
          nodeTitle: 'Complete the research pass', instruction: 'Record the research inputs considered before final approval.',
        },
      ],
    },
  ],
} as const satisfies StarterLibraryManifest;
