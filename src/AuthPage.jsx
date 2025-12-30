import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { FaBolt, FaEye, FaEyeSlash, FaUser, FaLock, FaEnvelope, FaSignInAlt, FaUserPlus, FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";
import { createClient } from "@supabase/supabase-js";

// Ініціалізація клієнта Supabase
const supabaseUrl = 'https://logxutaepqzmvgsvscle.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3h1dGFlcHF6bXZnc3ZzY2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5ODU4MDEsImV4cCI6MjA2OTU2MTgwMX0.NhbaKL5X48jHyPPxZ-6EadLcBfM-NMxMA8qbksT9VhE';
const supabase = createClient(supabaseUrl, supabaseKey);

// Покращений компонент для полів вводу
const InputField = ({ name, type, placeholder, value, onChange, icon, disabled, required = true, minLength }) => (
  <div className="relative group">
    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors duration-300">
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
      className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-300 shadow-sm text-slate-800 placeholder-slate-400"
    />
  </div>
);

// Компонент для відображення вимог до пароля
const PasswordPolicy = ({ password }) => {
    const checks = {
        length: password.length >= 8,
        number: /\d/.test(password),
        specialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };

    const Requirement = ({ text, met }) => (
        <div className={`flex items-center text-xs transition-colors duration-300 ${met ? 'text-green-600' : 'text-slate-500'}`}>
            {met ? <FaCheckCircle className="mr-2" /> : <FaExclamationTriangle className="mr-2" />}
            <span>{text}</span>
        </div>
    );

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <Requirement text="Мінімум 8 символів" met={checks.length} />
            <Requirement text="Містить хоча б одну цифру" met={checks.number} />
            <Requirement text="Містить спецсимвол (!@#...)" met={checks.specialChar} />
        </div>
    );
};


export default function AuthPage() {
  const [isSignIn, setIsSignIn] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true); 
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  
  const navigate = useNavigate();

  // Перевірка наявності активної сесії при завантаженні компонента
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        navigate("/home");
      } else {
        setIsLoading(false);
      }
    };

    checkSession();
    
    // Слухач змін стану автентифікації
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate("/home");
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    
    if (error) setError("");
    if (successMessage) setSuccessMessage("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    
    // Валідація для реєстрації
    if (!isSignIn) {
      if (formData.password !== formData.confirmPassword) {
        setError("Паролі не співпадають.");
        return;
      }
      const passwordIsValid = formData.password.length >= 8 && /\d/.test(formData.password) && /[!@#$%^&*(),.?":{}|<>]/.test(formData.password);
      if (!passwordIsValid) {
        setError("Пароль не відповідає вимогам безпеки.");
        return;
      }
    }
    
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
        });

        if (profileError) throw profileError;
        
        setSuccessMessage("Реєстрація успішна! Підтвердіть свою пошту та увійдіть в акаунт.");
        toggleMode();

      } else { // ВХІД
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

        if (signInError) throw signInError;
        // Навігація відбудеться автоматично завдяки onAuthStateChange
      }
    } catch (err) {
      const errorMessage = err.message || "Сталася невідома помилка.";
      if (errorMessage.includes("User already registered")) {
        setError("Користувач з такою поштою вже існує.");
      } else if (errorMessage.includes("Invalid login credentials")) {
        setError("Невірна пошта або пароль.");
      } else if (errorMessage.includes("Email rate limit exceeded")) {
        setError("Ліміт відправки листів перевищено. Спробуйте пізніше.");
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignIn(!isSignIn);
    setFormData({ firstName: "", lastName: "", email: "", password: "", confirmPassword: "" });
    setError("");
    setSuccessMessage("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };
  
  // Екран завантаження
  if (isLoading && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <FaBolt className="animate-pulse text-indigo-500 text-6xl" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans flex items-center justify-center p-4">
      
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
        
        <div className="h-40 bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center relative">
            <div className="w-24 h-24 bg-white/95 backdrop-blur-sm rounded-full flex items-center justify-center shadow-2xl absolute -bottom-12 border-4 border-white">
                <FaBolt className="text-5xl text-indigo-600" />
            </div>
        </div>
        
        <div className="p-8 pt-16"> 
          <AnimatePresence mode="wait">
            <motion.div
              key={isSignIn ? "signIn" : "signUp"}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="w-full"
            >
              <h2 className="text-4xl font-bold text-slate-800 mb-2 text-center tracking-tight">
                {isSignIn ? "З поверненням!" : "Створити акаунт"}
              </h2>
              <p className="text-md text-slate-500 mb-8 text-center">
                {isSignIn ? "Раді бачити вас знову" : "Заповніть форму для початку"}
              </p>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 rounded-r-lg mb-6 text-sm font-medium"
                >
                  {error}
                </motion.div>
              )}
              
              {successMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-green-50 border-l-4 border-green-400 text-green-700 px-4 py-3 rounded-r-lg mb-6 text-sm font-medium"
                >
                  {successMessage}
                </motion.div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {!isSignIn && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField name="firstName" type="text" placeholder="Ім'я" value={formData.firstName} onChange={handleChange} icon={<FaUser />} disabled={isLoading}/>
                    <InputField name="lastName" type="text" placeholder="Прізвище" value={formData.lastName} onChange={handleChange} icon={<FaUser />} disabled={isLoading}/>
                  </div>
                )}

                <InputField name="email" type="email" placeholder="Електронна пошта" value={formData.email} onChange={handleChange} icon={<FaEnvelope />} disabled={isLoading}/>
                
                <div className="relative">
                  <InputField name="password" type={showPassword ? "text" : "password"} placeholder="Пароль" value={formData.password} onChange={handleChange} icon={<FaLock />} disabled={isLoading} minLength={8}/>
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors focus:outline-none">
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>

                {!isSignIn && (
                   <>
                    <div className="relative">
                        <InputField name="confirmPassword" type={showConfirmPassword ? "text" : "password"} placeholder="Підтвердити пароль" value={formData.confirmPassword} onChange={handleChange} icon={<FaLock />} disabled={isLoading} minLength={8}/>
                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors focus:outline-none">
                            {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                        </button>
                    </div>
                    <PasswordPolicy password={formData.password} />
                   </>
                )}

                 {isSignIn && (
                    <div className="flex items-center justify-between">
                       <label className="flex items-center text-sm text-slate-600 cursor-pointer">
                           <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                           <span className="ml-2">Запам'ятати мене</span>
                       </label>
                    </div>
                 )}


                <motion.button 
                    whileHover={{ scale: 1.02, y: -2 }} 
                    whileTap={{ scale: 0.98, y: 0 }} 
                    type="submit" 
                    disabled={isLoading} 
                    className="w-full px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-700 hover:from-indigo-700 hover:to-purple-800 disabled:from-slate-400 disabled:to-slate-500 text-white rounded-lg font-bold transition-all duration-300 shadow-lg hover:shadow-indigo-500/30 text-base tracking-wider flex items-center justify-center space-x-3 mt-6"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>ОБРОБКА...</span>
                    </>
                  ) : (
                    isSignIn ? (
                      <>
                        <FaSignInAlt />
                        <span>УВІЙТИ</span>
                      </>
                    ) : (
                      <>
                        <FaUserPlus />
                        <span>СТВОРИТИ АКАУНТ</span>
                      </>
                    )
                  )}
                </motion.button>
              </form>
            </motion.div>
          </AnimatePresence>
          
          <div className="mt-8 text-center">
              <span className="text-sm text-slate-500">
                {isSignIn ? 'Вперше тут?' : 'Вже маєте акаунт?'}
              </span>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleMode}
                disabled={isLoading}
                className="ml-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors focus:outline-none"
              >
                {isSignIn ? 'Зареєструватись' : 'Увійти в систему'}
              </motion.button>
           </div>
        </div>
      </div>
    </div>
  );
}