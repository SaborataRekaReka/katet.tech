import { defineModule } from "@directus/extensions-sdk";
import ModuleComponent from "./module.vue";

export default defineModule({
  id: "katet-seo-studio-link",
  name: "SEO-конвейер",
  icon: "travel_explore",
  color: "#2563eb",
  routes: [
    {
      path: "",
      component: ModuleComponent,
    },
  ],
});
