// Preview API types and data fetching

export interface PreviewData {
  id: string;
  businessName: string;
  businessType: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  rating: number;
  ratingCount: number;
  hoursDisplay: string;
  hours: { day: string; time: string; isClosed: boolean }[];
  heroImage: string;
  seo: {
    title: string;
    description: string;
    keywords: string;
    canonicalUrl?: string;
    schemaType: string;
  };
  theme: {
    primary: string;
    primaryDark: string;
    accent: string;
    accentHover: string;
    background: string;
    foreground: string;
    graySection: string;
    headingFont: string;
    bodyFont: string;
  };
  hero: {
    headline: string;
    subheadline: string;
    primaryCta: string;
    secondaryCta: string;
    trustBadges: string[];
  };
  servicesSection: {
    tagline: string;
    headline: string;
    subheadline: string;
    services: { icon: string; title: string; description: string }[];
  };
  whyChooseUs: {
    tagline: string;
    headline: string;
    benefits: { icon: string; title: string; description: string }[];
  };
  serviceArea: {
    headline: string;
    addressDisplay: string;
    hoursHeadline: string;
    hoursSubtext: string;
    phoneHeadline: string;
  };
  reviewsSection: {
    tagline: string;
    headline: string;
    subheadline: string;
    reviews: { text: string; rating: number; author: string }[];
  };
  emergencyCta: {
    headline: string;
    subheadline: string;
    ctaText: string;
  };
  contactSection: {
    tagline: string;
    headline: string;
    trustBadges: string[];
    servingNote: string;
  };
  footer: {
    copyright: string;
    links?: { label: string; href: string }[];
  };
}

// ============================================
// MOCK DATA FOR DEVELOPMENT
// ============================================

const mockPreviewData: Record<string, PreviewData> = {
  "nyc-plumber": {
    id: "nyc-plumber",
    businessName: "NYC Emergency Plumber & Sewer",
    businessType: "plumber",
    phone: "(332) 900-3335",
    address: "17 Cleveland Pl, New York, NY 10012, USA",
    city: "New York",
    state: "NY",
    zipCode: "10012",
    rating: 4.9,
    ratingCount: 41,
    hoursDisplay: "Open 24 Hours - 7 Days a Week",
    hours: [
      { day: "Monday", time: "Open 24 Hours", isClosed: false },
      { day: "Tuesday", time: "Open 24 Hours", isClosed: false },
      { day: "Wednesday", time: "Open 24 Hours", isClosed: false },
      { day: "Thursday", time: "Open 24 Hours", isClosed: false },
      { day: "Friday", time: "Open 24 Hours", isClosed: false },
      { day: "Saturday", time: "Open 24 Hours", isClosed: false },
      { day: "Sunday", time: "Open 24 Hours", isClosed: false },
    ],
    heroImage: "/placeholder.svg",
    seo: {
      title: "NYC Emergency Plumber & Sewer | 24/7 Plumbing Services NYC",
      description:
        "NYC's trusted 24/7 emergency plumbing service. Licensed plumbers for drain cleaning, sewer repair, water heaters & more. Call (332) 900-3335 for fast service!",
      keywords:
        "NYC plumber, emergency plumbing, 24/7 plumber NYC, sewer repair, drain cleaning, water heater repair",
      canonicalUrl: "https://nycemergencyplumber.com",
      schemaType: "Plumber",
    },
    theme: {
      primary: "224 64% 33%",
      primaryDark: "224 71% 21%",
      accent: "25 95% 53%",
      accentHover: "25 95% 45%",
      background: "210 40% 98%",
      foreground: "222 47% 11%",
      graySection: "220 14% 96%",
      headingFont: "Inter",
      bodyFont: "Inter",
    },
    hero: {
      headline: "24/7 Emergency Plumbing Services in NYC",
      subheadline: "Fast, Reliable Solutions for All Your Plumbing & Sewer Needs",
      primaryCta: "Call Now (332) 900-3335",
      secondaryCta: "Get Free Quote",
      trustBadges: ["Available 24/7", "Licensed & Insured", "Same-Day Service"],
    },
    servicesSection: {
      tagline: "WHAT WE OFFER",
      headline: "Our Expert Plumbing Services",
      subheadline:
        "From emergency repairs to complete installations, our licensed plumbers deliver top-quality service throughout NYC.",
      services: [
        {
          icon: "Wrench",
          title: "Emergency Plumbing Repairs",
          description:
            "24/7 availability for burst pipes, leaks, and all urgent plumbing issues. We respond fast when you need us most.",
        },
        {
          icon: "Droplets",
          title: "Drain Cleaning & Unclogging",
          description:
            "Professional cleaning for kitchen sinks, bathroom drains, and main lines. Say goodbye to stubborn clogs.",
        },
        {
          icon: "PipetteIcon",
          title: "Sewer Line Repair & Replacement",
          description:
            "Advanced trenchless technology and camera inspections for efficient sewer solutions with minimal disruption.",
        },
        {
          icon: "Flame",
          title: "Water Heater Services",
          description:
            "Expert installation, repair, and maintenance for all types of water heaters. Never run out of hot water.",
        },
        {
          icon: "Settings",
          title: "Pipe Installation & Repair",
          description:
            "New construction, repiping, and leak detection services. Quality materials and expert craftsmanship.",
        },
        {
          icon: "Bath",
          title: "Bathroom & Kitchen Plumbing",
          description:
            "Complete fixture installation and renovations. Transform your spaces with professional plumbing work.",
        },
      ],
    },
    whyChooseUs: {
      tagline: "WHY CHOOSE US",
      headline: "Your Trusted NYC Plumbing Experts",
      benefits: [
        {
          icon: "Clock",
          title: "24/7 Emergency Service",
          description:
            "Plumbing emergencies don't wait, and neither do we. Available around the clock, every day of the year.",
        },
        {
          icon: "Shield",
          title: "Licensed & Insured",
          description:
            "Fully licensed, bonded, and insured for your complete peace of mind and protection.",
        },
        {
          icon: "Zap",
          title: "Fast Response Time",
          description:
            "We pride ourselves on quick arrival times. Most calls answered within 60 minutes.",
        },
        {
          icon: "Award",
          title: "Experienced Professionals",
          description:
            "Our team of certified master plumbers brings decades of combined experience.",
        },
        {
          icon: "DollarSign",
          title: "Upfront Pricing",
          description:
            "No hidden fees or surprise charges. We provide clear quotes before any work begins.",
        },
        {
          icon: "ThumbsUp",
          title: "Satisfaction Guaranteed",
          description:
            "We stand behind our work with a 100% satisfaction guarantee on all services.",
        },
      ],
    },
    serviceArea: {
      headline: "Serving All of New York City",
      addressDisplay: "17 Cleveland Pl, New York, NY 10012",
      hoursHeadline: "Open 24 Hours Every Day",
      hoursSubtext: "Emergency services available around the clock",
      phoneHeadline: "Call Us Anytime",
    },
    reviewsSection: {
      tagline: "TESTIMONIALS",
      headline: "What Our Customers Say",
      subheadline: "Based on 41+ Google Reviews",
      reviews: [
        {
          text: "My kitchen sink had been draining at a very slow pace, which made everyday cooking tasks frustrating. The technician brought proper equipment and cleared the clog efficiently. Now the water flows freely, and washing dishes is no longer a problem.",
          rating: 5,
          author: "Verified Customer",
        },
        {
          text: "NYC Plumbing handled my trenchless sewer repair effortlessly. The whole process was smooth and stress free. I'll definitely recommend them to friends and family.",
          rating: 5,
          author: "Verified Customer",
        },
        {
          text: "The sewer repair service we got from NYC Plumbing was top notch. The tech explained the problem and handled it without hassle. Highly recommend!",
          rating: 5,
          author: "Verified Customer",
        },
      ],
    },
    emergencyCta: {
      headline: "Plumbing Emergency?",
      subheadline:
        "Don't wait – our expert plumbers are standing by 24/7 to help you with any plumbing crisis.",
      ctaText: "Call (332) 900-3335 Now",
    },
    contactSection: {
      tagline: "CONTACT US",
      headline: "NYC Emergency Plumber & Sewer",
      trustBadges: [
        "Licensed, Bonded & Insured",
        "Certified Master Plumbers",
        "100% Satisfaction Guarantee",
        "Free Estimates Available",
        "Serving All NYC Boroughs",
      ],
      servingNote:
        "Proudly serving Manhattan, Brooklyn, Queens, The Bronx, and Staten Island with professional plumbing services.",
    },
    footer: {
      copyright: `© ${new Date().getFullYear()} NYC Emergency Plumber & Sewer. All rights reserved.`,
      links: [
        { label: "Privacy Policy", href: "#" },
        { label: "Terms of Service", href: "#" },
      ],
    },
  },

  "boston-cpa": {
    id: "boston-cpa",
    businessName: "Harbor Tax & Accounting",
    businessType: "accountant",
    phone: "(617) 555-0123",
    address: "100 Federal St, Suite 800, Boston, MA 02110, USA",
    city: "Boston",
    state: "MA",
    zipCode: "02110",
    rating: 4.8,
    ratingCount: 87,
    hoursDisplay: "Mon-Fri 8:00 AM - 6:00 PM",
    hours: [
      { day: "Monday", time: "8:00 AM - 6:00 PM", isClosed: false },
      { day: "Tuesday", time: "8:00 AM - 6:00 PM", isClosed: false },
      { day: "Wednesday", time: "8:00 AM - 6:00 PM", isClosed: false },
      { day: "Thursday", time: "8:00 AM - 6:00 PM", isClosed: false },
      { day: "Friday", time: "8:00 AM - 6:00 PM", isClosed: false },
      { day: "Saturday", time: "By Appointment", isClosed: false },
      { day: "Sunday", time: "Closed", isClosed: true },
    ],
    heroImage: "/placeholder.svg",
    seo: {
      title: "Harbor Tax & Accounting | CPA Services Boston MA",
      description:
        "Trusted Boston CPA firm offering tax preparation, bookkeeping, and business accounting services. Personalized financial solutions for individuals and businesses.",
      keywords:
        "Boston CPA, tax preparation, accountant Boston, bookkeeping services, small business accounting, tax planning",
      canonicalUrl: "https://harbortaxboston.com",
      schemaType: "AccountingService",
    },
    theme: {
      primary: "152 45% 28%",
      primaryDark: "152 50% 18%",
      accent: "45 93% 47%",
      accentHover: "45 93% 40%",
      background: "40 33% 98%",
      foreground: "152 30% 15%",
      graySection: "40 20% 96%",
      headingFont: "Inter",
      bodyFont: "Inter",
    },
    hero: {
      headline: "Expert Tax & Accounting Services in Boston",
      subheadline: "Personalized Financial Solutions for Individuals and Businesses",
      primaryCta: "Schedule Consultation",
      secondaryCta: "View Services",
      trustBadges: ["Licensed CPA", "20+ Years Experience", "Free Initial Consultation"],
    },
    servicesSection: {
      tagline: "OUR SERVICES",
      headline: "Comprehensive Financial Solutions",
      subheadline:
        "From tax preparation to full-service bookkeeping, we help you navigate complex financial matters with confidence.",
      services: [
        {
          icon: "FileText",
          title: "Individual Tax Preparation",
          description:
            "Maximize your refund with expert personal tax preparation. We handle everything from simple returns to complex situations.",
        },
        {
          icon: "Building",
          title: "Business Tax Services",
          description:
            "Strategic tax planning and preparation for businesses of all sizes. Minimize liability and stay compliant.",
        },
        {
          icon: "Calculator",
          title: "Bookkeeping & Payroll",
          description:
            "Monthly bookkeeping, payroll processing, and financial reporting to keep your business running smoothly.",
        },
        {
          icon: "TrendingUp",
          title: "Financial Planning",
          description:
            "Comprehensive financial planning and advisory services to help you achieve your long-term goals.",
        },
        {
          icon: "Shield",
          title: "IRS Representation",
          description:
            "Expert representation for audits, appeals, and tax disputes. We protect your interests with the IRS.",
        },
        {
          icon: "Briefcase",
          title: "Business Formation",
          description:
            "LLC, S-Corp, and business entity setup. Choose the right structure for tax efficiency and liability protection.",
        },
      ],
    },
    whyChooseUs: {
      tagline: "WHY CHOOSE US",
      headline: "Your Trusted Financial Partner",
      benefits: [
        {
          icon: "Award",
          title: "Licensed CPAs",
          description:
            "Our team of certified public accountants brings expertise and credentials you can trust.",
        },
        {
          icon: "Clock",
          title: "Year-Round Support",
          description:
            "We're here for you beyond tax season. Get help whenever you need financial guidance.",
        },
        {
          icon: "Users",
          title: "Personalized Service",
          description:
            "Every client receives individualized attention and strategies tailored to their unique situation.",
        },
        {
          icon: "Lock",
          title: "Secure & Confidential",
          description:
            "Your financial data is protected with bank-level security and strict confidentiality protocols.",
        },
        {
          icon: "DollarSign",
          title: "Transparent Pricing",
          description:
            "No surprises. Clear, upfront pricing for all services with no hidden fees.",
        },
        {
          icon: "Zap",
          title: "Fast Turnaround",
          description:
            "Efficient processing without sacrificing accuracy. Get your returns filed quickly.",
        },
      ],
    },
    serviceArea: {
      headline: "Serving Greater Boston",
      addressDisplay: "100 Federal St, Suite 800, Boston, MA",
      hoursHeadline: "Monday - Friday",
      hoursSubtext: "8:00 AM - 6:00 PM • Saturday by appointment",
      phoneHeadline: "Schedule a Call",
    },
    reviewsSection: {
      tagline: "CLIENT TESTIMONIALS",
      headline: "What Our Clients Say",
      subheadline: "Based on 87+ Google Reviews",
      reviews: [
        {
          text: "Harbor Tax has handled my business and personal taxes for 5 years now. They're thorough, professional, and always find deductions I would have missed. Highly recommend!",
          rating: 5,
          author: "Small Business Owner",
        },
        {
          text: "Finally found a CPA who actually explains things in plain English. They helped me understand my tax situation and plan for the future. Worth every penny.",
          rating: 5,
          author: "Verified Client",
        },
        {
          text: "I was behind on several years of taxes and dreading dealing with it. The team here made the process painless and even negotiated with the IRS on my behalf. A huge weight off my shoulders.",
          rating: 5,
          author: "Verified Client",
        },
      ],
    },
    emergencyCta: {
      headline: "Tax Season Approaching?",
      subheadline:
        "Don't wait until the last minute. Schedule your consultation today and get ahead of your tax obligations.",
      ctaText: "Book Your Consultation",
    },
    contactSection: {
      tagline: "GET IN TOUCH",
      headline: "Harbor Tax & Accounting",
      trustBadges: [
        "Licensed CPA Firm",
        "20+ Years in Business",
        "Member AICPA",
        "QuickBooks Certified ProAdvisor",
        "Secure Client Portal",
      ],
      servingNote:
        "Proudly serving individuals and businesses throughout Boston, Cambridge, Brookline, and the Greater Boston area.",
    },
    footer: {
      copyright: `© ${new Date().getFullYear()} Harbor Tax & Accounting. All rights reserved.`,
      links: [
        { label: "Privacy Policy", href: "#" },
        { label: "Terms of Service", href: "#" },
      ],
    },
  },

  "dallas-hvac": {
    id: "dallas-hvac",
    businessName: "Lone Star Heating & Cooling",
    businessType: "hvac",
    phone: "(214) 555-0456",
    address: "4500 McKinney Ave, Dallas, TX 75205, USA",
    city: "Dallas",
    state: "TX",
    zipCode: "75205",
    rating: 4.9,
    ratingCount: 156,
    hoursDisplay: "24/7 Emergency Service Available",
    hours: [
      { day: "Monday", time: "7:00 AM - 7:00 PM", isClosed: false },
      { day: "Tuesday", time: "7:00 AM - 7:00 PM", isClosed: false },
      { day: "Wednesday", time: "7:00 AM - 7:00 PM", isClosed: false },
      { day: "Thursday", time: "7:00 AM - 7:00 PM", isClosed: false },
      { day: "Friday", time: "7:00 AM - 7:00 PM", isClosed: false },
      { day: "Saturday", time: "8:00 AM - 5:00 PM", isClosed: false },
      { day: "Sunday", time: "Emergency Only", isClosed: false },
    ],
    heroImage: "/placeholder.svg",
    seo: {
      title: "Lone Star Heating & Cooling | HVAC Services Dallas TX",
      description:
        "Dallas's trusted HVAC company for AC repair, heating installation, and 24/7 emergency service. Licensed technicians serving the DFW metroplex.",
      keywords:
        "Dallas HVAC, AC repair Dallas, heating repair, air conditioning installation, furnace repair, emergency HVAC",
      canonicalUrl: "https://lonestarhvac.com",
      schemaType: "HVACBusiness",
    },
    theme: {
      primary: "210 65% 45%",
      primaryDark: "210 70% 30%",
      accent: "0 75% 55%",
      accentHover: "0 75% 45%",
      background: "210 40% 98%",
      foreground: "210 30% 15%",
      graySection: "210 15% 96%",
      headingFont: "Inter",
      bodyFont: "Inter",
    },
    hero: {
      headline: "Keep Your Home Comfortable Year-Round",
      subheadline: "Expert HVAC Installation, Repair & Maintenance in Dallas-Fort Worth",
      primaryCta: "Call Now (214) 555-0456",
      secondaryCta: "Schedule Service",
      trustBadges: ["24/7 Emergency Service", "Licensed & Insured", "Financing Available"],
    },
    servicesSection: {
      tagline: "OUR SERVICES",
      headline: "Complete HVAC Solutions",
      subheadline:
        "From emergency repairs to new system installations, our certified technicians keep your home at the perfect temperature.",
      services: [
        {
          icon: "Thermometer",
          title: "AC Repair & Service",
          description:
            "Fast, reliable air conditioning repair. We diagnose and fix all makes and models to restore your comfort quickly.",
        },
        {
          icon: "Flame",
          title: "Heating Repair & Installation",
          description:
            "Furnace repairs, heat pump service, and new heating system installations to keep you warm all winter.",
        },
        {
          icon: "Wind",
          title: "System Installation",
          description:
            "Expert installation of new HVAC systems. We help you choose the right equipment for your home and budget.",
        },
        {
          icon: "Settings",
          title: "Preventive Maintenance",
          description:
            "Regular tune-ups extend equipment life and prevent costly breakdowns. Join our maintenance plan and save.",
        },
        {
          icon: "Home",
          title: "Indoor Air Quality",
          description:
            "Air purifiers, humidifiers, and duct cleaning to improve the air your family breathes.",
        },
        {
          icon: "Zap",
          title: "Emergency Service",
          description:
            "HVAC emergency? We're available 24/7 for urgent repairs. No extra charge for nights or weekends.",
        },
      ],
    },
    whyChooseUs: {
      tagline: "WHY CHOOSE US",
      headline: "Dallas's Most Trusted HVAC Company",
      benefits: [
        {
          icon: "Clock",
          title: "Same-Day Service",
          description:
            "We understand urgency. Most service calls completed the same day you call.",
        },
        {
          icon: "Shield",
          title: "Licensed Technicians",
          description:
            "All technicians are NATE-certified, background-checked, and drug-tested for your peace of mind.",
        },
        {
          icon: "DollarSign",
          title: "Upfront Pricing",
          description:
            "Know the cost before we start. No hidden fees, no surprises on your bill.",
        },
        {
          icon: "Award",
          title: "Satisfaction Guarantee",
          description:
            "Not happy? We'll make it right. Your complete satisfaction is our top priority.",
        },
        {
          icon: "CreditCard",
          title: "Flexible Financing",
          description:
            "New system? We offer 0% financing options to fit any budget. Easy approval.",
        },
        {
          icon: "ThumbsUp",
          title: "5-Star Rated",
          description:
            "156+ five-star reviews. See why Dallas homeowners choose Lone Star.",
        },
      ],
    },
    serviceArea: {
      headline: "Serving the Dallas-Fort Worth Metroplex",
      addressDisplay: "4500 McKinney Ave, Dallas, TX",
      hoursHeadline: "Open 7 Days a Week",
      hoursSubtext: "24/7 emergency service available",
      phoneHeadline: "Call for Fast Service",
    },
    reviewsSection: {
      tagline: "CUSTOMER REVIEWS",
      headline: "What Dallas Homeowners Say",
      subheadline: "Based on 156+ Google Reviews",
      reviews: [
        {
          text: "AC went out on the hottest day of summer. Lone Star had a tech at my house within 2 hours and fixed it the same day. Fair price and great service!",
          rating: 5,
          author: "Dallas Homeowner",
        },
        {
          text: "Just had a new Trane system installed. The crew was professional, cleaned up everything, and took time to explain how to use the new thermostat. Highly recommend!",
          rating: 5,
          author: "Verified Customer",
        },
        {
          text: "Been using Lone Star for maintenance on my rental properties for 3 years. They're reliable, fairly priced, and their technicians are always professional.",
          rating: 5,
          author: "Property Manager",
        },
      ],
    },
    emergencyCta: {
      headline: "AC or Heater Not Working?",
      subheadline:
        "Don't sweat it! Our technicians are standing by 24/7 to restore your comfort fast.",
      ctaText: "Call (214) 555-0456 Now",
    },
    contactSection: {
      tagline: "CONTACT US",
      headline: "Lone Star Heating & Cooling",
      trustBadges: [
        "NATE Certified Technicians",
        "Licensed & Insured",
        "BBB A+ Rated",
        "Trane Comfort Specialist",
        "Veteran Owned",
      ],
      servingNote:
        "Proudly serving Dallas, Fort Worth, Plano, Frisco, McKinney, and the entire DFW metroplex.",
    },
    footer: {
      copyright: `© ${new Date().getFullYear()} Lone Star Heating & Cooling. All rights reserved.`,
      links: [
        { label: "Privacy Policy", href: "#" },
        { label: "Terms of Service", href: "#" },
      ],
    },
  },

  "denver-chiro": {
    id: "denver-chiro",
    businessName: "Peak Wellness Chiropractic",
    businessType: "chiropractor",
    phone: "(303) 555-0789",
    address: "1600 Broadway, Suite 300, Denver, CO 80202, USA",
    city: "Denver",
    state: "CO",
    zipCode: "80202",
    rating: 4.9,
    ratingCount: 203,
    hoursDisplay: "Mon-Fri 8:00 AM - 6:00 PM, Sat 9:00 AM - 1:00 PM",
    hours: [
      { day: "Monday", time: "8:00 AM - 6:00 PM", isClosed: false },
      { day: "Tuesday", time: "8:00 AM - 6:00 PM", isClosed: false },
      { day: "Wednesday", time: "8:00 AM - 6:00 PM", isClosed: false },
      { day: "Thursday", time: "8:00 AM - 6:00 PM", isClosed: false },
      { day: "Friday", time: "8:00 AM - 6:00 PM", isClosed: false },
      { day: "Saturday", time: "9:00 AM - 1:00 PM", isClosed: false },
      { day: "Sunday", time: "Closed", isClosed: true },
    ],
    heroImage: "/placeholder.svg",
    seo: {
      title: "Peak Wellness Chiropractic | Denver Chiropractor",
      description:
        "Denver's top-rated chiropractic clinic. Specializing in back pain, neck pain, sports injuries, and whole-body wellness. New patient specials available.",
      keywords:
        "Denver chiropractor, back pain relief, neck pain treatment, sports chiropractic, spinal adjustment, wellness care",
      canonicalUrl: "https://peakwellnesschiro.com",
      schemaType: "Chiropractor",
    },
    theme: {
      primary: "175 60% 35%",
      primaryDark: "175 65% 25%",
      accent: "15 85% 55%",
      accentHover: "15 85% 45%",
      background: "175 20% 98%",
      foreground: "175 40% 15%",
      graySection: "175 15% 96%",
      headingFont: "Inter",
      bodyFont: "Inter",
    },
    hero: {
      headline: "Live Pain-Free. Move Better. Feel Amazing.",
      subheadline: "Natural, Drug-Free Relief for Back Pain, Neck Pain & More",
      primaryCta: "Book Appointment",
      secondaryCta: "New Patient Special",
      trustBadges: ["Same-Day Appointments", "Most Insurance Accepted", "New Patient Special $49"],
    },
    servicesSection: {
      tagline: "OUR TREATMENTS",
      headline: "Comprehensive Chiropractic Care",
      subheadline:
        "We take a whole-body approach to health, addressing the root cause of your pain—not just the symptoms.",
      services: [
        {
          icon: "Activity",
          title: "Spinal Adjustments",
          description:
            "Precise, gentle adjustments to restore proper alignment and relieve pain at its source.",
        },
        {
          icon: "HeartPulse",
          title: "Sports Injury Rehab",
          description:
            "Get back in the game faster with specialized treatment for athletes and active individuals.",
        },
        {
          icon: "Baby",
          title: "Prenatal & Pediatric",
          description:
            "Gentle, safe chiropractic care for expecting mothers and children of all ages.",
        },
        {
          icon: "Zap",
          title: "Spinal Decompression",
          description:
            "Non-surgical treatment for herniated discs, sciatica, and chronic back pain.",
        },
        {
          icon: "Dumbbell",
          title: "Corrective Exercises",
          description:
            "Personalized exercise programs to strengthen your body and prevent future injuries.",
        },
        {
          icon: "Leaf",
          title: "Wellness & Prevention",
          description:
            "Proactive care to maintain optimal health and prevent problems before they start.",
        },
      ],
    },
    whyChooseUs: {
      tagline: "WHY CHOOSE US",
      headline: "Denver's Most Trusted Chiropractor",
      benefits: [
        {
          icon: "Award",
          title: "Experienced Doctors",
          description:
            "Our doctors have 15+ years of experience and advanced certifications in multiple techniques.",
        },
        {
          icon: "Clock",
          title: "Same-Day Appointments",
          description:
            "In pain now? We offer same-day appointments to get you relief as quickly as possible.",
        },
        {
          icon: "Heart",
          title: "Patient-Centered Care",
          description:
            "We listen first, then create a personalized treatment plan for your unique needs.",
        },
        {
          icon: "CreditCard",
          title: "Insurance Friendly",
          description:
            "We work with most major insurance plans and offer affordable self-pay options.",
        },
        {
          icon: "MapPin",
          title: "Convenient Location",
          description:
            "Easy downtown Denver location with free parking. Get in and out quickly.",
        },
        {
          icon: "Star",
          title: "5-Star Reviews",
          description:
            "203+ five-star reviews from patients who found lasting relief at our clinic.",
        },
      ],
    },
    serviceArea: {
      headline: "Serving Downtown Denver & Surrounding Areas",
      addressDisplay: "1600 Broadway, Suite 300, Denver, CO",
      hoursHeadline: "Mon-Fri 8AM-6PM, Sat 9AM-1PM",
      hoursSubtext: "Same-day appointments often available",
      phoneHeadline: "Call to Book",
    },
    reviewsSection: {
      tagline: "PATIENT TESTIMONIALS",
      headline: "Hear From Our Patients",
      subheadline: "Based on 203+ Google Reviews",
      reviews: [
        {
          text: "I've struggled with chronic lower back pain for years. After just a few visits to Peak Wellness, I'm virtually pain-free. Dr. Johnson really listens and explains everything clearly.",
          rating: 5,
          author: "Denver Patient",
        },
        {
          text: "As a marathon runner, I put my body through a lot. The team here keeps me in peak condition and has helped me recover from multiple injuries. Can't recommend them enough!",
          rating: 5,
          author: "Athlete",
        },
        {
          text: "Brought my 8-year-old who was having headaches. They were so gentle and patient with her. Headaches are gone after 3 visits! We're believers now.",
          rating: 5,
          author: "Parent",
        },
      ],
    },
    emergencyCta: {
      headline: "Ready to Feel Better?",
      subheadline:
        "Take the first step toward a pain-free life. New patients receive a comprehensive exam for just $49.",
      ctaText: "Claim Your $49 New Patient Special",
    },
    contactSection: {
      tagline: "SCHEDULE YOUR VISIT",
      headline: "Peak Wellness Chiropractic",
      trustBadges: [
        "Board Certified Doctors",
        "15+ Years Experience",
        "Most Insurance Accepted",
        "Modern Facility",
        "Free Parking",
      ],
      servingNote:
        "Proudly serving patients from Denver, Aurora, Lakewood, Englewood, and the greater metro area.",
    },
    footer: {
      copyright: `© ${new Date().getFullYear()} Peak Wellness Chiropractic. All rights reserved.`,
      links: [
        { label: "Privacy Policy", href: "#" },
        { label: "Terms of Service", href: "#" },
      ],
    },
  },

  "chicago-cleaning": {
    id: "chicago-cleaning",
    businessName: "Spotless Commercial Cleaning",
    businessType: "commercial cleaning",
    phone: "(312) 555-0234",
    address: "233 S Wacker Dr, Chicago, IL 60606, USA",
    city: "Chicago",
    state: "IL",
    zipCode: "60606",
    rating: 4.8,
    ratingCount: 94,
    hoursDisplay: "24/7 Service Available",
    hours: [
      { day: "Monday", time: "24 Hours", isClosed: false },
      { day: "Tuesday", time: "24 Hours", isClosed: false },
      { day: "Wednesday", time: "24 Hours", isClosed: false },
      { day: "Thursday", time: "24 Hours", isClosed: false },
      { day: "Friday", time: "24 Hours", isClosed: false },
      { day: "Saturday", time: "24 Hours", isClosed: false },
      { day: "Sunday", time: "24 Hours", isClosed: false },
    ],
    heroImage: "/placeholder.svg",
    seo: {
      title: "Spotless Commercial Cleaning | Chicago Office Cleaning Services",
      description:
        "Professional commercial cleaning services in Chicago. Office cleaning, janitorial services, and specialized cleaning for businesses of all sizes.",
      keywords:
        "Chicago commercial cleaning, office cleaning, janitorial services, business cleaning, professional cleaners Chicago",
      canonicalUrl: "https://spotlesscommercial.com",
      schemaType: "LocalBusiness",
    },
    theme: {
      primary: "200 70% 40%",
      primaryDark: "200 75% 28%",
      accent: "145 65% 42%",
      accentHover: "145 65% 35%",
      background: "200 25% 98%",
      foreground: "200 40% 12%",
      graySection: "200 15% 96%",
      headingFont: "Inter",
      bodyFont: "Inter",
    },
    hero: {
      headline: "Professional Commercial Cleaning That Shines",
      subheadline: "Reliable, Thorough Cleaning Services for Chicago Businesses",
      primaryCta: "Get Free Quote",
      secondaryCta: "Our Services",
      trustBadges: ["Bonded & Insured", "Green Cleaning Options", "Flexible Scheduling"],
    },
    servicesSection: {
      tagline: "OUR SERVICES",
      headline: "Complete Commercial Cleaning Solutions",
      subheadline:
        "From daily office cleaning to specialized deep cleaning, we keep your workspace spotless and professional.",
      services: [
        {
          icon: "Building",
          title: "Office Cleaning",
          description:
            "Daily, weekly, or monthly office cleaning tailored to your schedule. We work around your business hours.",
        },
        {
          icon: "Sparkles",
          title: "Deep Cleaning",
          description:
            "Comprehensive deep cleaning for carpets, upholstery, and hard-to-reach areas. Perfect for seasonal refreshes.",
        },
        {
          icon: "Trash2",
          title: "Janitorial Services",
          description:
            "Ongoing janitorial support including restroom maintenance, trash removal, and restocking supplies.",
        },
        {
          icon: "Wind",
          title: "Floor Care",
          description:
            "Professional floor stripping, waxing, buffing, and carpet cleaning to keep floors looking new.",
        },
        {
          icon: "Warehouse",
          title: "Industrial Cleaning",
          description:
            "Heavy-duty cleaning for warehouses, manufacturing facilities, and industrial spaces.",
        },
        {
          icon: "Leaf",
          title: "Green Cleaning",
          description:
            "Eco-friendly cleaning products and practices. Healthier for your employees and the environment.",
        },
      ],
    },
    whyChooseUs: {
      tagline: "WHY CHOOSE US",
      headline: "Chicago's Premier Commercial Cleaners",
      benefits: [
        {
          icon: "Shield",
          title: "Fully Bonded & Insured",
          description:
            "Complete protection for your property. All employees background-checked and bonded.",
        },
        {
          icon: "Clock",
          title: "Flexible Scheduling",
          description:
            "Day, evening, or weekend service. We clean when it's convenient for you.",
        },
        {
          icon: "Users",
          title: "Trained Professionals",
          description:
            "Our cleaning teams are professionally trained, uniformed, and supervised.",
        },
        {
          icon: "CheckCircle",
          title: "Quality Guaranteed",
          description:
            "Not satisfied? We'll re-clean at no additional cost. Your satisfaction is guaranteed.",
        },
        {
          icon: "Leaf",
          title: "Eco-Friendly Options",
          description:
            "Green cleaning products available upon request. LEED-compliant practices.",
        },
        {
          icon: "DollarSign",
          title: "Competitive Pricing",
          description:
            "Transparent pricing with no hidden fees. Get a free, no-obligation quote today.",
        },
      ],
    },
    serviceArea: {
      headline: "Serving Chicago & Suburbs",
      addressDisplay: "233 S Wacker Dr, Chicago, IL",
      hoursHeadline: "24/7 Service Available",
      hoursSubtext: "Day, evening, and weekend cleaning options",
      phoneHeadline: "Call for Free Quote",
    },
    reviewsSection: {
      tagline: "CLIENT REVIEWS",
      headline: "Trusted by Chicago Businesses",
      subheadline: "Based on 94+ Google Reviews",
      reviews: [
        {
          text: "We switched to Spotless 6 months ago and the difference is night and day. Our office has never looked better, and the team is incredibly reliable and professional.",
          rating: 5,
          author: "Office Manager",
        },
        {
          text: "Great experience with their green cleaning services. Important to us that we use eco-friendly products, and the results are just as good. Highly recommend!",
          rating: 5,
          author: "Business Owner",
        },
        {
          text: "They handle our 50,000 sq ft facility and do an excellent job. Responsive communication and consistently high quality. A true partner for our business.",
          rating: 5,
          author: "Facilities Director",
        },
      ],
    },
    emergencyCta: {
      headline: "Need Cleaning Services?",
      subheadline:
        "Get a free, no-obligation quote for your business. We'll customize a cleaning plan that fits your needs and budget.",
      ctaText: "Request Free Quote",
    },
    contactSection: {
      tagline: "GET A QUOTE",
      headline: "Spotless Commercial Cleaning",
      trustBadges: [
        "Bonded & Insured",
        "Background-Checked Staff",
        "Green Seal Certified",
        "24/7 Support",
        "Satisfaction Guaranteed",
      ],
      servingNote:
        "Proudly serving businesses in Chicago, Oak Park, Evanston, Naperville, and throughout Chicagoland.",
    },
    footer: {
      copyright: `© ${new Date().getFullYear()} Spotless Commercial Cleaning. All rights reserved.`,
      links: [
        { label: "Privacy Policy", href: "#" },
        { label: "Terms of Service", href: "#" },
      ],
    },
  },

  "seattle-it": {
    id: "seattle-it",
    businessName: "Pacific Tech Solutions",
    businessType: "it support",
    phone: "(206) 555-0567",
    address: "1001 4th Ave, Suite 3200, Seattle, WA 98154, USA",
    city: "Seattle",
    state: "WA",
    zipCode: "98154",
    rating: 4.9,
    ratingCount: 67,
    hoursDisplay: "Mon-Fri 8:00 AM - 6:00 PM, 24/7 Emergency Support",
    hours: [
      { day: "Monday", time: "8:00 AM - 6:00 PM", isClosed: false },
      { day: "Tuesday", time: "8:00 AM - 6:00 PM", isClosed: false },
      { day: "Wednesday", time: "8:00 AM - 6:00 PM", isClosed: false },
      { day: "Thursday", time: "8:00 AM - 6:00 PM", isClosed: false },
      { day: "Friday", time: "8:00 AM - 6:00 PM", isClosed: false },
      { day: "Saturday", time: "Emergency Only", isClosed: false },
      { day: "Sunday", time: "Emergency Only", isClosed: false },
    ],
    heroImage: "/placeholder.svg",
    seo: {
      title: "Pacific Tech Solutions | IT Support & Managed Services Seattle",
      description:
        "Seattle's trusted IT support partner. Managed IT services, cybersecurity, cloud solutions, and 24/7 help desk for small and medium businesses.",
      keywords:
        "Seattle IT support, managed IT services, cybersecurity Seattle, cloud computing, IT consulting, tech support",
      canonicalUrl: "https://pacifictechsolutions.com",
      schemaType: "LocalBusiness",
    },
    theme: {
      primary: "260 55% 50%",
      primaryDark: "260 60% 35%",
      accent: "200 90% 50%",
      accentHover: "200 90% 42%",
      background: "260 20% 98%",
      foreground: "260 30% 12%",
      graySection: "260 12% 96%",
      headingFont: "Inter",
      bodyFont: "Inter",
    },
    hero: {
      headline: "IT Support That Actually Solves Problems",
      subheadline: "Proactive Technology Management for Growing Seattle Businesses",
      primaryCta: "Get IT Assessment",
      secondaryCta: "View Services",
      trustBadges: ["24/7 Help Desk", "Flat-Rate Pricing", "15-Min Response Time"],
    },
    servicesSection: {
      tagline: "OUR SERVICES",
      headline: "Comprehensive IT Solutions",
      subheadline:
        "From help desk support to complete IT management, we handle your technology so you can focus on your business.",
      services: [
        {
          icon: "Headphones",
          title: "Help Desk Support",
          description:
            "Fast, friendly IT support when you need it. Remote and on-site assistance with 15-minute average response time.",
        },
        {
          icon: "Server",
          title: "Managed IT Services",
          description:
            "Proactive monitoring, maintenance, and management of your entire IT infrastructure. Predictable monthly costs.",
        },
        {
          icon: "Shield",
          title: "Cybersecurity",
          description:
            "Protect your business from threats with advanced security solutions, training, and 24/7 monitoring.",
        },
        {
          icon: "Cloud",
          title: "Cloud Solutions",
          description:
            "Microsoft 365, Azure, AWS, and cloud migration services. Work from anywhere, securely.",
        },
        {
          icon: "Database",
          title: "Backup & Recovery",
          description:
            "Automated backups and disaster recovery planning. Never lose critical data again.",
        },
        {
          icon: "Network",
          title: "Network Solutions",
          description:
            "Network design, implementation, and management. Fast, reliable connectivity for your team.",
        },
      ],
    },
    whyChooseUs: {
      tagline: "WHY CHOOSE US",
      headline: "Your Strategic IT Partner",
      benefits: [
        {
          icon: "Zap",
          title: "15-Min Response Time",
          description:
            "When you have an issue, we respond fast. Our average response time is under 15 minutes.",
        },
        {
          icon: "DollarSign",
          title: "Flat-Rate Pricing",
          description:
            "Predictable monthly costs with no surprise bills. Unlimited support included in all plans.",
        },
        {
          icon: "Clock",
          title: "24/7 Monitoring",
          description:
            "We monitor your systems around the clock. Most issues are fixed before you even notice.",
        },
        {
          icon: "Award",
          title: "Certified Experts",
          description:
            "Microsoft, Cisco, and CompTIA certified engineers with years of real-world experience.",
        },
        {
          icon: "TrendingUp",
          title: "Strategic Guidance",
          description:
            "More than just support—we help you plan and budget for technology that drives growth.",
        },
        {
          icon: "Lock",
          title: "Security Focused",
          description:
            "Cybersecurity is built into everything we do. Protect your business from evolving threats.",
        },
      ],
    },
    serviceArea: {
      headline: "Serving Seattle & Puget Sound Region",
      addressDisplay: "1001 4th Ave, Suite 3200, Seattle, WA",
      hoursHeadline: "Mon-Fri 8AM-6PM",
      hoursSubtext: "24/7 emergency support for managed clients",
      phoneHeadline: "Call Us Today",
    },
    reviewsSection: {
      tagline: "CLIENT TESTIMONIALS",
      headline: "What Our Clients Say",
      subheadline: "Based on 67+ Google Reviews",
      reviews: [
        {
          text: "Pacific Tech transformed our IT from a constant headache to something we never have to think about. They're proactive, responsive, and truly understand our business needs.",
          rating: 5,
          author: "CEO, Tech Startup",
        },
        {
          text: "After a ransomware scare with our previous provider, we switched to Pacific Tech. Their security protocols are top-notch and we finally feel protected. Worth every penny.",
          rating: 5,
          author: "Operations Manager",
        },
        {
          text: "The flat-rate pricing is a game changer. No more surprise bills, and we actually use support when we need it instead of avoiding calls. Great team!",
          rating: 5,
          author: "Business Owner",
        },
      ],
    },
    emergencyCta: {
      headline: "Struggling with IT Issues?",
      subheadline:
        "Get a free IT assessment and discover how we can eliminate your technology headaches.",
      ctaText: "Schedule Free Assessment",
    },
    contactSection: {
      tagline: "LET'S TALK",
      headline: "Pacific Tech Solutions",
      trustBadges: [
        "Microsoft Partner",
        "Cisco Certified",
        "SOC 2 Compliant",
        "24/7 Support",
        "Flat-Rate Pricing",
      ],
      servingNote:
        "Proudly serving businesses in Seattle, Bellevue, Tacoma, Redmond, and throughout the Puget Sound region.",
    },
    footer: {
      copyright: `© ${new Date().getFullYear()} Pacific Tech Solutions. All rights reserved.`,
      links: [
        { label: "Privacy Policy", href: "#" },
        { label: "Terms of Service", href: "#" },
      ],
    },
  },
};

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Fetch preview data from the API
 * 
 * In development: uses mock data
 * In production: calls real API endpoint
 */
export async function fetchPreviewData(id: string): Promise<PreviewData> {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";
  const useMockData = import.meta.env.DEV || !apiBaseUrl;

  // Use mock data in development or if no API URL is configured
  if (useMockData) {
    await new Promise((resolve) => setTimeout(resolve, 200)); // Simulate network
    const data = mockPreviewData[id];
    if (!data) {
      throw new Error(`Preview not found for id: ${id}`);
    }
    return data;
  }

  // Production: call real API
  const response = await fetch(`${apiBaseUrl}/api/preview/${id}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch preview: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Lookup preview ID by domain
 * Used when the app is deployed to a custom domain
 */
export async function fetchIdByDomain(domain: string): Promise<string | null> {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";
  
  // In dev mode, skip domain lookup
  if (import.meta.env.DEV) {
    return null;
  }
  
  try {
    const response = await fetch(`${apiBaseUrl}/api/domain-lookup?domain=${domain}`);
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.id;
  } catch {
    return null;
  }
}

// Export mock data for testing
export { mockPreviewData };
