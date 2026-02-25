import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function ContactCardDisplay({ content, onOpenContact }) {
   const [expanded, setExpanded] = useState(false);

   if (!content.startsWith("[contact]")) return null;

   const contactJson = content.slice(9);
   let contact;
   try {
     contact = JSON.parse(contactJson);
   } catch (e) {
     return null;
   }

   const handleNameClick = (e) => {
     e.stopPropagation();
     window.dispatchEvent(new CustomEvent('openContact', { detail: contact }));
   };

   const handlePhoneClick = (e) => {
     e.stopPropagation();
     e.preventDefault();
     window.dispatchEvent(new CustomEvent('openDialer', { detail: { phone: contact.phone, contact } }));
   };

   const handleEmailClick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('openEmailComposer', { detail: { email: contact.email, contact } }));
    };

   return (
       <div className="mt-2 bg-gradient-to-br from-[#B8956A]/10 to-[#B8956A]/5 border border-[#B8956A]/20 rounded-lg p-3 cursor-pointer hover:border-[#B8956A]/40 transition-all"
         onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
         <div className="flex items-start justify-between">
           <div className="flex-1">
             <h4 className="font-semibold text-gray-900 text-sm hover:text-[#B8956A] transition-colors cursor-pointer" onClick={handleNameClick}>{contact.name}</h4>
            {contact.company && (
              <p className="text-xs text-gray-600 mt-0.5">{contact.company}</p>
            )}
          </div>
          <ChevronDown className={`w-4 h-4 text-[#B8956A] transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>

        {expanded && (
          <div className="mt-3 space-y-2 pt-3 border-t border-[#B8956A]/20">
            {contact.email && (
              <div>
                <p className="text-xs text-gray-500">Email</p>
                <button onClick={handleEmailClick} className="text-xs text-[#B8956A] hover:underline break-all text-left">
                  {contact.email}
                </button>
              </div>
            )}
            {contact.phone && (
              <div>
                <p className="text-xs text-gray-500">Phone</p>
                <button onClick={handlePhoneClick} className="text-xs text-[#B8956A] hover:underline text-left">
                  {contact.phone}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
     );
}