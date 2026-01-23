import React from "react";
import { Link } from "react-router-dom";
import { Facebook, Twitter, Instagram, Linkedin, Mail, Phone, MapPin } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-300 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">

          {/* Company Info */}
          <div className="space-y-4">
            <h3 className="text-2xl font-bold text-white tracking-tight">Sledge Solutions</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Empowering retailers and distributors with seamless inventory management, real-time analytics, and efficient supply chain solutions.
            </p>
            <div className="flex space-x-4 pt-2">
              <a href="#" className="text-slate-400 hover:text-indigo-400 transition-colors">
                <Facebook className="w-5 h-5" />
              </a>
              <a href="#" className="text-slate-400 hover:text-indigo-400 transition-colors">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="text-slate-400 hover:text-indigo-400 transition-colors">
                <Instagram className="w-5 h-5" />
              </a>
              <a href="#" className="text-slate-400 hover:text-indigo-400 transition-colors">
                <Linkedin className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Quick Links</h3>
            <ul className="space-y-3">
              <li>
                <Link to="/" className="text-slate-400 hover:text-indigo-400 transition-colors text-sm">Home</Link>
              </li>
              <li>
                <Link to="/features" className="text-slate-400 hover:text-indigo-400 transition-colors text-sm">Features</Link>
              </li>
              <li>
                <Link to="/pricing" className="text-slate-400 hover:text-indigo-400 transition-colors text-sm">Pricing</Link>
              </li>
              <li>
                <Link to="/contact" className="text-slate-400 hover:text-indigo-400 transition-colors text-sm">Contact</Link>
              </li>
            </ul>
          </div>

          {/* Services */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Services</h3>
            <ul className="space-y-3">
              <li>
                <Link to="/services/inventory-management" className="text-slate-400 hover:text-indigo-400 transition-colors text-sm">Inventory Management</Link>
              </li>
              <li>
                <Link to="/services/supply-chain" className="text-slate-400 hover:text-indigo-400 transition-colors text-sm">Supply Chain</Link>
              </li>
              <li>
                <Link to="/services/analytics" className="text-slate-400 hover:text-indigo-400 transition-colors text-sm">Analytics</Link>
              </li>
              <li>
                <Link to="/services/support" className="text-slate-400 hover:text-indigo-400 transition-colors text-sm">24/7 Support</Link>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Contact Us</h3>
            <ul className="space-y-4">
              <li className="flex items-start">
                <Mail className="w-5 h-5 text-indigo-500 mr-3 flex-shrink-0 mt-0.5" />
                <span className="text-slate-400 text-sm">support@sledgesolutions.com</span>
              </li>
              <li className="flex items-start">
                <Phone className="w-5 h-5 text-indigo-500 mr-3 flex-shrink-0 mt-0.5" />
                <span className="text-slate-400 text-sm">+1 (555) 123-4567</span>
              </li>
              <li className="flex items-start">
                <MapPin className="w-5 h-5 text-indigo-500 mr-3 flex-shrink-0 mt-0.5" />
                <span className="text-slate-400 text-sm">
                  123 Business Avenue,<br />
                  Tech District, CA 94043
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-slate-500 text-sm text-center md:text-left">
            &copy; {new Date().getFullYear()} Sledge Solutions. All rights reserved.
          </p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <Link to="/privacy" className="text-slate-500 hover:text-indigo-400 text-sm transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="text-slate-500 hover:text-indigo-400 text-sm transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}