// Single source of truth for the Media Specialist job page content.
// The public page (AboutJob.jsx) renders these as defaults, and the
// KhethaIQ "Edit Page" flow pre-populates the JobOpening with these exact
// values so the edit modal opens with the SAME words the page displays.

export const MEDIA_JOB_DEFAULTS = {
  title: "Get paid for additional real estate media projects on your schedule.",
  page_description:
    "Join Arriv Estate Media's growing network of professional photographers and videographers. Accept only the projects you want while continuing to grow your own business.",
  description_text:
    "Arriv Estate Media connects real estate agents, builders, and property managers with trusted media specialists. We handle the booking and project management so you can focus on creating great content.",
  responsibilities: [
    "Residential real estate photography",
    "Luxury property photography",
    "Real estate videography",
    "Drone photography / videography",
    "Twilight photography",
    "Floor plans & other property marketing services",
  ],
  required_qualifications: [
    "Experience photographing residential real estate",
    "Professional camera equipment",
    "Reliable transportation",
    "Strong communication skills",
    "Ability to meet deadlines",
    "Attention to detail",
  ],
  preferred_qualifications: [
    "HDR Photography",
    "Adobe Lightroom",
    "Photoshop",
    "Matterport",
    "Zillow 3D Home",
    "Real estate video editing",
    "Drone photography",
  ],
  employment_type: "contract",
  work_arrangement: "onsite",
  compensation: "Get Paid Per Project",
  work_schedule: "Flexible schedule",
  location: "Maryland",
  benefits: ["Flexible schedule", "Work Location: In person"],
};