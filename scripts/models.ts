// Every Mongoose model, so maintenance scripts (indexes, migrations) see the full schema set.
import { Address } from "../src/models/address";
import { Article } from "../src/models/article";
import { AuditLog } from "../src/models/audit-log";
import { Cart } from "../src/models/cart";
import { Category } from "../src/models/category";
import { ContentPage } from "../src/models/content-page";
import { Coupon } from "../src/models/coupon";
import { CouponRedemption } from "../src/models/coupon-redemption";
import { DeliveryZone } from "../src/models/delivery-zone";
import { Homepage } from "../src/models/homepage";
import { InventoryMovement } from "../src/models/inventory-movement";
import { Order } from "../src/models/order";
import { PasswordReset } from "../src/models/password-reset";
import { Product } from "../src/models/product";
import { RateLimit } from "../src/models/rate-limit";
import { Review, ReviewReport, ReviewVote } from "../src/models/review";
import { Session } from "../src/models/session";
import { Settings } from "../src/models/settings";
import { User } from "../src/models/user";
import { WebhookEvent } from "../src/models/webhook-event";

export const allModels = [Address, Article, AuditLog, Cart, Category, ContentPage, Coupon, CouponRedemption, DeliveryZone, Homepage, InventoryMovement, Order, PasswordReset, Product, RateLimit, Review, ReviewReport, ReviewVote, Session, Settings, User, WebhookEvent];
