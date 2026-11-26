/**
 * NYU schools, their programs, and how an NYU course code (`SUBJECT-XX NNNN`) maps to the
 * school that teaches it. Used by the "Your subjects this semester" dialog to put the
 * student's own school's courses first.
 */

export type NyuSchool = {
  /** Stable id saved in the student's auth metadata (`nyu_school`). */
  id: string;
  name: string;
  shortName: string;
  /** Programs offered (the dialog adds "Other / undeclared" after these). */
  programs: string[];
  /** Code suffixes after the dash (e.g. "UA" in `ECON-UA 1`) that belong to this school. */
  suffixes: string[];
  /** Exact `SUBJECT-SUFFIX` prefixes that belong to this school, checked before suffixes. */
  prefixes?: string[];
};

export const OTHER_PROGRAM = "Other / undeclared";

export const NYU_SCHOOLS: NyuSchool[] = [
  {
    id: "cas",
    name: "College of Arts & Science",
    shortName: "CAS",
    programs: [
      "Biology (BA)",
      "Chemistry (BA)",
      "Economics (BA)",
      "English (BA)",
      "History (BA)",
      "Neural Science (BA)",
      "Philosophy (BA)",
      "Politics (BA)",
      "Psychology (BA)",
    ],
    suffixes: ["UA"],
  },
  {
    id: "courant",
    name: "Courant Institute of Mathematical Sciences",
    shortName: "Courant",
    programs: [
      "Computer Science (BA)",
      "Mathematics (BA)",
      "Data Science (BA)",
      "Computer Science (MS)",
      "Mathematics (MS)",
      "Scientific Computing (MS)",
      "Mathematics in Finance (MS)",
      "Computer Science (PhD)",
      "Mathematics (PhD)",
    ],
    suffixes: [],
    prefixes: ["CSCI-UA", "CSCI-GA", "MATH-UA", "MATH-GA", "DS-UA", "DS-GA"],
  },
  {
    id: "gsas",
    name: "Graduate School of Arts & Science",
    shortName: "GSAS",
    programs: [
      "Biology (MS/PhD)",
      "Economics (MA/PhD)",
      "English (MA/PhD)",
      "History (MA/PhD)",
      "Journalism (MA)",
      "Philosophy (PhD)",
      "Politics (MA/PhD)",
      "Psychology (MA/PhD)",
      "Sociology (PhD)",
    ],
    suffixes: ["GA"],
  },
  {
    id: "stern",
    name: "Stern School of Business",
    shortName: "Stern",
    programs: [
      "Business (BS)",
      "Business and Political Economy (BS)",
      "Business, Technology and Entrepreneurship (BS)",
      "Full-time MBA",
      "Part-time MBA",
      "Executive MBA",
      "Accounting (MS)",
      "Business Analytics (MS)",
      "Quantitative Finance (MS)",
    ],
    suffixes: ["UB", "GB"],
  },
  {
    id: "tandon",
    name: "Tandon School of Engineering",
    shortName: "Tandon",
    programs: [
      "Computer Science (BS)",
      "Computer Engineering (BS)",
      "Electrical Engineering (BS)",
      "Mechanical Engineering (BS)",
      "Civil Engineering (BS)",
      "Integrated Design & Media (BS)",
      "Computer Science (MS)",
      "Cybersecurity (MS)",
      "Financial Engineering (MS)",
      "Electrical Engineering (MS)",
    ],
    suffixes: ["UY", "GY"],
  },
  {
    id: "steinhardt",
    name: "Steinhardt School of Culture, Education, and Human Development",
    shortName: "Steinhardt",
    programs: [
      "Applied Psychology (BS)",
      "Childhood Education (BS)",
      "Media, Culture, and Communication (BS)",
      "Music Business (BM)",
      "Nutrition and Dietetics (BS)",
      "Physical Therapy (DPT)",
      "Speech-Language Pathology (MS)",
      "Teaching English to Speakers of Other Languages (MA)",
    ],
    suffixes: ["UE", "GE"],
  },
  {
    id: "tisch",
    name: "Tisch School of the Arts",
    shortName: "Tisch",
    programs: [
      "Film and Television (BFA)",
      "Drama (BFA)",
      "Dance (BFA)",
      "Dramatic Writing (BFA)",
      "Photography and Imaging (BFA)",
      "Interactive Media Arts (BS)",
      "Game Design (BFA)",
      "Interactive Telecommunications (MPS)",
      "Graduate Film (MFA)",
    ],
    suffixes: ["UT", "GT"],
  },
  {
    id: "gallatin",
    name: "Gallatin School of Individualized Study",
    shortName: "Gallatin",
    programs: ["Individualized Study (BA)", "Individualized Study (MA)"],
    suffixes: ["UG", "GG"],
  },
  {
    id: "sps",
    name: "School of Professional Studies",
    shortName: "SPS",
    programs: [
      "Hospitality and Tourism Management (BS)",
      "Real Estate (BS)",
      "Sports Management (BS)",
      "Integrated Marketing (MS)",
      "Management and Systems (MS)",
      "Professional Writing (MS)",
      "Human Resource Management and Development (MS)",
      "Applied Data Science (BS)",
    ],
    suffixes: ["UC", "GC", "CE"],
  },
  {
    id: "silver",
    name: "Silver School of Social Work",
    shortName: "Silver",
    programs: ["Social Work (BS)", "Social Work (MSW)", "Social Work (DSW)", "Social Work (PhD)"],
    suffixes: ["US", "GS"],
  },
  {
    id: "wagner",
    name: "Robert F. Wagner Graduate School of Public Service",
    shortName: "Wagner",
    programs: [
      "Public Administration (MPA)",
      "Urban Planning (MUP)",
      "Health Policy and Management (MPA)",
      "Public and Nonprofit Management and Policy (MPA)",
      "Executive MPA",
      "Public Administration (PhD)",
    ],
    suffixes: ["GP"],
  },
  {
    id: "gph",
    name: "School of Global Public Health",
    shortName: "GPH",
    programs: [
      "Global Public Health (BS)",
      "Public Health (MPH)",
      "Biostatistics (MS)",
      "Epidemiology (MS/PhD)",
      "Social and Behavioral Sciences (PhD)",
    ],
    suffixes: ["UU", "GU"],
  },
  {
    id: "meyers",
    name: "Rory Meyers College of Nursing",
    shortName: "Meyers",
    programs: [
      "Nursing (BS)",
      "Accelerated Nursing (BS)",
      "Adult-Gerontology Primary Care NP (MS)",
      "Family Nurse Practitioner (MS)",
      "Nursing Practice (DNP)",
      "Nursing Research and Theory (PhD)",
    ],
    suffixes: ["UN", "GN"],
  },
  {
    id: "dentistry",
    name: "College of Dentistry",
    shortName: "Dentistry",
    programs: [
      "Doctor of Dental Surgery (DDS)",
      "Dental Hygiene (AAS/BS)",
      "Advanced Standing DDS",
      "Advanced Education in General Dentistry",
      "Orthodontics",
    ],
    suffixes: ["UD", "DN"],
  },
  {
    id: "grossman",
    name: "Grossman School of Medicine",
    shortName: "Grossman",
    programs: [
      "Doctor of Medicine (MD)",
      "MD/PhD",
      "Biomedical Sciences (PhD)",
      "Clinical Investigation (MS)",
      "Biomedical Informatics (MS)",
    ],
    suffixes: ["GM", "MD"],
  },
  {
    id: "nyu-long-island",
    name: "Grossman Long Island School of Medicine",
    shortName: "NYU Long Island",
    programs: ["Doctor of Medicine (MD, primary care)"],
    suffixes: ["LI"],
  },
  {
    id: "law",
    name: "School of Law",
    shortName: "Law",
    programs: [
      "Juris Doctor (JD)",
      "LLM",
      "LLM in Taxation",
      "LLM in International Business Regulation",
      "Doctor of Juridical Science (JSD)",
    ],
    suffixes: ["LW"],
  },
  {
    id: "liberal-studies",
    name: "Liberal Studies",
    shortName: "Liberal Studies",
    programs: ["Core Program (first two years)", "Global Liberal Studies (BA)"],
    suffixes: ["UF"],
  },
  {
    id: "ifa",
    name: "Institute of Fine Arts",
    shortName: "IFA",
    programs: [
      "History of Art and Archaeology (MA)",
      "History of Art and Archaeology (PhD)",
      "Conservation of Historic and Artistic Works (MS/MA)",
    ],
    suffixes: [],
    prefixes: ["FINH-GA", "FIAR-GA", "CONS-GA"],
  },
  {
    id: "isaw",
    name: "Institute for the Study of the Ancient World",
    shortName: "ISAW",
    programs: ["Ancient World Studies (PhD)"],
    suffixes: [],
    prefixes: ["ISAW-GA"],
  },
  {
    id: "abu-dhabi",
    name: "NYU Abu Dhabi",
    shortName: "Abu Dhabi",
    programs: [
      "Computer Science (BS)",
      "Economics (BA)",
      "Engineering (BS)",
      "Political Science (BA)",
      "Film and New Media (BA)",
      "Biology (BS)",
    ],
    suffixes: ["UH", "AD"],
  },
  {
    id: "shanghai",
    name: "NYU Shanghai",
    shortName: "Shanghai",
    programs: [
      "Business and Finance (BS)",
      "Computer Science (BS)",
      "Data Science (BS)",
      "Economics (BS)",
      "Interactive Media and Business (BS)",
      "Neural Science (BS)",
    ],
    suffixes: ["SHU"],
  },
];

export function schoolById(id: string | null | undefined): NyuSchool | null {
  return NYU_SCHOOLS.find((s) => s.id === id) ?? null;
}

/** The programs to offer for a school, ending with "Other / undeclared". */
export function programsFor(id: string | null | undefined): string[] {
  const school = schoolById(id);
  return school ? [...school.programs, OTHER_PROGRAM] : [];
}

/**
 * The school that teaches an NYU course code like `CSCI-GA 1170` or `ECON-UA.1`, or null when
 * the code doesn't match any known school.
 */
export function schoolForCode(code: string): NyuSchool | null {
  const m = /^\s*([A-Z0-9]+)-([A-Z]+)/i.exec(code);
  if (!m) return null;
  const prefix = `${m[1]}-${m[2]}`.toUpperCase();
  const suffix = m[2]!.toUpperCase();
  return (
    NYU_SCHOOLS.find((s) => s.prefixes?.includes(prefix)) ??
    NYU_SCHOOLS.find((s) => s.suffixes.includes(suffix)) ??
    null
  );
}

/**
 * Splits search results into the chosen school's courses and everything else, keeping the
 * original order within each group.
 */
export function groupBySchool<T extends { code: string }>(
  items: T[],
  schoolId: string | null | undefined,
): { own: T[]; other: { item: T; school: NyuSchool | null }[] } {
  const own: T[] = [];
  const other: { item: T; school: NyuSchool | null }[] = [];
  for (const item of items) {
    const school = schoolForCode(item.code);
    if (schoolId && school?.id === schoolId) own.push(item);
    else other.push({ item, school });
  }
  return { own, other };
}
