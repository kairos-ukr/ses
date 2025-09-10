import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { FaBolt, FaEye, FaEyeSlash, FaUser, FaPhone, FaLock, FaEnvelope } from "react-icons/fa";
import { createClient } from "@supabase/supabase-js";

// Ініціалізація клієнта Supabase
const supabaseUrl = 'https://logxutaepqzmvgsvscle.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3h1dGFlcHF6bXZnc3ZzY2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5ODU4MDEsImV4cCI6MjA2OTU2MTgwMX0.NhbaKL5X48jHyPPxZ-6EadLcBfM-NMxMA8qbksT9VhE';
const supabase = createClient(supabaseUrl, supabaseKey);

// Компонент для полів вводу
const InputField = ({ name, type, placeholder, value, onChange, icon, disabled, required = true, minLength }) => (
  <div className="relative">
    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
      {icon}
    </span>
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      minLength={minLength}
      className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-300 shadow-sm"
    />
  </div>
);

export default function AuthPage() {
  const [isSignIn, setIsSignIn] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
  });
  
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (!isSignIn) { // РЕЄСТРАЦІЯ
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error("Не вдалося створити користувача.");

        const { error: profileError } = await supabase.from("user_site").insert({
          user_id: authData.user.id,
          first_name: formData.firstName,
          last_name: formData.lastName,
          email: formData.email,
          phone: formData.phone, // Зберігаємо телефон як додаткову інформацію
        });

        if (profileError) throw profileError;
        
        alert("Реєстрація успішна! Підтвердіть свою пошту та увійдіть в акаунт.");
        toggleMode();

      } else { // ВХІД
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

        if (signInError) throw signInError;
        navigate("/home");
      }
    } catch (err) {
      if (err.message.includes("User already registered")) {
        setError("Користувач з такою поштою вже існує.");
      } else if (err.message.includes("Invalid login credentials")) {
        setError("Невірна пошта або пароль.");
      } else if (err.message.includes("Email rate limit exceeded")) {
        setError("Ліміт відправки листів перевищено. Спробуйте пізніше.");
      }
      else {
        setError(err.message || "Сталася помилка. Спробуйте ще раз.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignIn(!isSignIn);
    setFormData({ firstName: "", lastName: "", email: "", phone: "", password: "" });
    setError("");
    setShowPassword(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="relative w-full max-w-4xl min-h-[650px] lg:min-h-[600px] bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/50 overflow-hidden flex flex-col lg:flex-row">
        
        {/* Панель з формами */}
        <div className="w-full lg:w-1/2 p-8 flex flex-col justify-center order-2 lg:order-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={isSignIn ? "signIn" : "signUp"}
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="w-full"
            >
              <h2 className="text-3xl font-bold text-gray-800 mb-2 text-center">
                {isSignIn ? "Авторизація" : "Створення акаунту"}
              </h2>
              <p className="text-sm text-gray-600 mb-6 text-center">
                {isSignIn ? "Введіть дані для входу в систему" : "Заповніть дані для реєстрації"}
              </p>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm"
                >
                  {error}
                </motion.div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {!isSignIn && (
                  <>
                    <InputField name="firstName" type="text" placeholder="Ім'я" value={formData.firstName} onChange={handleChange} icon={<FaUser />} disabled={isLoading}/>
                    <InputField name="lastName" type="text" placeholder="Прізвище" value={formData.lastName} onChange={handleChange} icon={<FaUser />} disabled={isLoading}/>
                  </>
                )}

                <InputField name="email" type="email" placeholder="Електронна пошта" value={formData.email} onChange={handleChange} icon={<FaEnvelope />} disabled={isLoading}/>
                
                {!isSignIn && (
                   <InputField name="phone" type="tel" placeholder="Номер телефону (необов'язково)" value={formData.phone} onChange={handleChange} icon={<FaPhone />} disabled={isLoading} required={false}/>
                )}
                
                <div className="relative">
                  <InputField name="password" type={showPassword ? "text" : "password"} placeholder="Пароль" value={formData.password} onChange={handleChange} icon={<FaLock />} disabled={isLoading} minLength={6}/>
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
                
                {!isSignIn && (
                  <p className="text-xs text-gray-500 pt-1 text-center">
                    Пароль має містити щонайменше 6 символів (літери та цифри).
                  </p>
                )}

                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={isLoading} className="w-full px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:from-gray-400 text-white rounded-xl font-medium transition-all duration-300 shadow-lg hover:shadow-xl text-sm uppercase tracking-wide transform hover:-translate-y-0.5 pt-4">
                  {isLoading ? 'ОБРОБКА...' : (isSignIn ? 'УВІЙТИ' : 'ЗАРЕЄСТРУВАТИСЬ')}
                </motion.button>
              </form>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Інформаційна панель */}
        <div className="w-full lg:w-1/2 p-8 flex flex-col justify-center items-center text-center text-white bg-gradient-to-br from-indigo-500 to-purple-600 order-1 lg:order-2 rounded-b-2xl lg:rounded-l-none lg:rounded-r-2xl">
           <motion.div
              key={isSignIn ? "infoSignIn" : "infoSignUp"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7 }}
            >
              <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-6 backdrop-blur-sm shadow-lg">
                <FaBolt className="text-3xl" />
              </div>
              <h1 className="text-3xl font-bold mb-2">
                {isSignIn ? 'Ще не з нами?' : 'Вже маєте акаунт?'}
              </h1>
              <p className="text-white/90 mb-6 px-4">
                {isSignIn 
                  ? 'Створіть обліковий запис, щоб отримати повний доступ до системи.'
                  : 'Увійдіть, щоб продовжити роботу з вашими проєктами.'}
              </p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleMode}
                disabled={isLoading}
                className="px-8 py-2.5 bg-white/20 hover:bg-white/30 border-2 border-white rounded-xl font-medium transition-all duration-300 text-sm shadow-lg"
              >
                {isSignIn ? 'РЕЄСТРАЦІЯ' : 'ВХІД'}
              </motion.button>
           </motion.div>
        </div>
      </div>
    </div>
  );
}
