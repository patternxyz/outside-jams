import { Controller, Get } from "@nestjs/common";

@Controller("hello")
export class AppController {
  @Get()
  getHello(): { message: string } {
    return { message: "Hello!" };
  }
}
